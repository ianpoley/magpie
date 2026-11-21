import { EVOLUTION } from '../config.ts';
import type { JevClient } from '../jev/client.ts';
import { scorePairs } from '../jev/tagger.ts';
import { transaction } from '../store/db.ts';
import type { Store } from '../store/db.ts';
import type { SubtopicProposal, TopicProposal } from './propose.ts';
import { isDeletedAreaName, key, overlapsTombstone, takenTopicNames } from './tombstones.ts';
import { ATTEMPT_KIND } from './triggers.ts';
import type { BroadTopic } from './triggers.ts';
import { CHANGE_KIND } from './undo.ts';
import type { NewTopicSnapshot, SplitSnapshot } from './undo.ts';

export type RoundDeps = { jev: JevClient; runId?: number; now: () => Date };

export type RoundOutcome = 'applied' | 'rejected' | 'dropped' | { skipped: string };

function thresholds(db: Store): { confident: number; unsure: number } {
  const read = db.prepare(`SELECT CAST(value AS REAL) AS value FROM meta WHERE key = ?`);
  return { confident: Number(read.get('band_confident')?.value), unsure: Number(read.get('band_unsure')?.value) };
}

function recordAttempt(
  db: Store,
  deps: RoundDeps,
  attempt: {
    kind: string;
    outcome: 'applied' | 'rejected' | 'dropped';
    reason?: string;
    topicId?: number;
    unfiledCount?: number;
    proposal: unknown;
    matches?: string[];
    changeId?: number;
    seen?: string[];
  },
): void {
  transaction(db, () => {
    const id = db
      .prepare(
        `INSERT INTO proposal_attempts
           (kind, outcome, reason, topic_id, unfiled_count, proposal_json, match_set_json, change_id, run_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        attempt.kind,
        attempt.outcome,
        attempt.reason ?? null,
        attempt.topicId ?? null,
        attempt.unfiledCount ?? null,
        JSON.stringify(attempt.proposal),
        attempt.matches ? JSON.stringify(attempt.matches) : null,
        attempt.changeId ?? null,
        deps.runId ?? null,
        deps.now().toISOString(),
      ).lastInsertRowid;
    const seen = db.prepare(`INSERT INTO proposal_seen_posts (post_id, attempt_id) VALUES (?, ?)`);
    for (const postId of attempt.seen ?? []) seen.run(postId, id);
  });
}

function logChange(
  db: Store,
  deps: RoundDeps,
  change: { kind: string; summary: string; postCount: number; snapshot: unknown; topics: [number, string][] },
): number {
  const id = Number(
    db
      .prepare(
        `INSERT INTO changes (kind, source, summary, post_count, snapshot_json, undoable, run_id, created_at)
         VALUES (?, 'auto', ?, ?, ?, 1, ?, ?)`,
      )
      .run(
        change.kind,
        change.summary,
        change.postCount,
        JSON.stringify(change.snapshot),
        deps.runId ?? null,
        deps.now().toISOString(),
      ).lastInsertRowid,
  );
  const touch = db.prepare(`INSERT INTO change_topics (change_id, topic_id, role) VALUES (?, ?, ?)`);
  for (const [topicId, role] of change.topics) touch.run(id, topicId, role);
  return id;
}

function nameProblem(db: Store, name: string): string | null {
  const names = takenTopicNames(db);
  if (names.inUse.has(key(name))) return 'name_in_use';
  if (names.blocked.has(key(name))) return 'name_removed_by_user';
  return null;
}

function nextTopicPosition(db: Store, areaId: number | null): number {
  return Number(
    db.prepare(`SELECT COALESCE(MAX(position), -1) + 1 AS next FROM topics WHERE area_id IS ?`).get(areaId)?.next,
  );
}

export async function newTopicRound(
  db: Store,
  deps: RoundDeps,
  proposal: TopicProposal,
  eligible: string[],
  shown: string[],
): Promise<RoundOutcome> {
  const attempt = { kind: ATTEMPT_KIND.newTopic, unfiledCount: eligible.length, proposal, seen: shown };
  const reject = (reason: string, matches?: string[]): RoundOutcome => {
    recordAttempt(db, deps, { ...attempt, outcome: 'rejected', reason, matches });
    return 'rejected';
  };
  const blocked = (): string | null => {
    if (!proposal.name || !proposal.definition || !proposal.area) return 'empty_label';
    return nameProblem(db, proposal.name) ?? (isDeletedAreaName(db, proposal.area) ? 'area_removed_by_user' : null);
  };

  const problem = blocked();
  if (problem) return reject(problem);

  const topicId = Number(
    db
      .prepare(
        `INSERT INTO topics (name, definition, kind, state, created_at) VALUES (?, ?, 'auto', 'proposed', ?)`,
      )
      .run(proposal.name, proposal.definition, deps.now().toISOString()).lastInsertRowid,
  );
  try {
    const scored = await scorePairs(
      db,
      { jev: deps.jev, now: deps.now },
      eligible.map((postId) => ({ postId, topicId })),
    );
    if (scored.failed > 0) return { skipped: scored.errors[0] ?? 'scoring failed' };

    const matches = db
      .prepare(`SELECT post_id FROM scores WHERE topic_id = ? AND probability >= ? ORDER BY post_id`)
      .all(topicId, thresholds(db).confident)
      .map((row) => String(row.post_id));
    if (matches.length < EVOLUTION.newTopicMinConfident) return reject('too_few_matches', matches);
    if (overlapsTombstone(db, matches)) return reject('matches_removed_by_user', matches);

    return transaction(db, (): RoundOutcome => {
      const now = deps.now().toISOString();
      const changed = blocked();
      if (changed) {
        recordAttempt(db, deps, { ...attempt, outcome: 'dropped', reason: changed, matches });
        return 'dropped';
      }
      const existing = db
        .prepare(`SELECT id, name FROM areas WHERE state = 'active' AND kind = 'auto' AND lower(name) = ? ORDER BY id`)
        .get(key(proposal.area));
      const areaId = Number(
        existing
          ? existing.id
          : db
              .prepare(
                `INSERT INTO areas (name, kind, hidden, position, created_at)
                 VALUES (?, 'auto', ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM areas), ?)`,
              )
              .run(proposal.area, proposal.areaHidden ? 1 : 0, now).lastInsertRowid,
      );
      db.prepare(`UPDATE topics SET state = 'active', area_id = ?, position = ? WHERE id = ?`).run(
        areaId,
        nextTopicPosition(db, areaId),
        topicId,
      );
      const snapshot: NewTopicSnapshot = { topicId, areaId, areaCreated: !existing };
      const changeId = logChange(db, deps, {
        kind: CHANGE_KIND.newTopic,
        summary: `New topic: ${existing ? existing.name : proposal.area} › ${proposal.name}`,
        postCount: matches.length,
        snapshot,
        topics: [[topicId, 'created']],
      });
      recordAttempt(db, deps, { ...attempt, outcome: 'applied', topicId, matches, changeId });
      return 'applied';
    });
  } finally {
    db.prepare(`DELETE FROM topics WHERE id = ? AND state = 'proposed'`).run(topicId);
  }
}

export async function splitRound(
  db: Store,
  deps: RoundDeps,
  parent: BroadTopic,
  proposals: SubtopicProposal[],
): Promise<RoundOutcome> {
  const attempt = {
    kind: ATTEMPT_KIND.split,
    topicId: parent.id,
    proposal: { parentConfident: parent.confident, subtopics: proposals },
  };
  const reject = (reason: string): RoundOutcome => {
    recordAttempt(db, deps, { ...attempt, outcome: 'rejected', reason });
    return 'rejected';
  };

  const members = db
    .prepare(`SELECT post_id, band FROM topic_membership WHERE topic_id = ? ORDER BY post_id`)
    .all(parent.id)
    .map((row) => ({ postId: String(row.post_id), confident: row.band === 'confident' }));
  const parentConfident = members.filter((member) => member.confident).map((member) => member.postId);

  const names = new Set<string>();
  const usable = proposals.filter((proposal) => {
    if (!proposal.name || !proposal.definition || names.has(key(proposal.name))) return false;
    names.add(key(proposal.name));
    return nameProblem(db, proposal.name) === null;
  });
  if (usable.length < EVOLUTION.splitMinSubtopics) return reject('too_few_subtopics');

  const insert = db.prepare(
    `INSERT INTO topics (area_id, name, definition, kind, state, split_from, created_at)
     VALUES (?, ?, ?, 'auto', 'proposed', ?, ?)`,
  );
  const candidates = usable.map((proposal) => ({
    ...proposal,
    id: Number(
      insert.run(parent.areaId, proposal.name, proposal.definition, parent.id, deps.now().toISOString())
        .lastInsertRowid,
    ),
  }));
  try {
    const scored = await scorePairs(
      db,
      { jev: deps.jev, now: deps.now },
      members.flatMap(({ postId }) => candidates.map((candidate) => ({ postId, topicId: candidate.id }))),
    );
    if (scored.failed > 0) return { skipped: scored.errors[0] ?? 'scoring failed' };

    const bands = thresholds(db);
    const readScores = db.prepare(`SELECT post_id, probability FROM scores WHERE topic_id = ?`);
    const scoresOf = new Map<number, Map<string, number>>();
    for (const candidate of candidates) {
      scoresOf.set(
        candidate.id,
        new Map(readScores.all(candidate.id).map((row) => [String(row.post_id), Number(row.probability)])),
      );
    }
    const score = (topicId: number, postId: string): number => scoresOf.get(topicId)?.get(postId) ?? 0;

    const covered = new Set<string>();
    const subtopics = candidates.filter((candidate) => {
      const matches = parentConfident.filter((postId) => score(candidate.id, postId) >= bands.confident);
      if (matches.length < EVOLUTION.splitMinConfidentPerSubtopic || overlapsTombstone(db, matches)) return false;
      for (const postId of matches) covered.add(postId);
      return true;
    });
    if (subtopics.length < EVOLUTION.splitMinSubtopics) return reject('too_few_subtopics_hold_up');
    if (covered.size < EVOLUTION.splitMinCoverage * parentConfident.length) return reject('low_coverage');

    const best = (postId: string): number =>
      subtopics.reduce((top, subtopic) => (score(subtopic.id, postId) > score(top.id, postId) ? subtopic : top)).id;

    return transaction(db, (): RoundOutcome => {
      const now = deps.now().toISOString();
      const current = db.prepare(`SELECT state, locked FROM topics WHERE id = ?`).get(parent.id);
      const renamedAway = subtopics.some((subtopic) => nameProblem(db, subtopic.name) !== null);
      if (!current || current.state !== 'active' || current.locked !== 0 || renamedAway) {
        recordAttempt(db, deps, { ...attempt, outcome: 'dropped', reason: 'edited_by_user' });
        return 'dropped';
      }

      const activate = db.prepare(`UPDATE topics SET state = 'active', position = ? WHERE id = ?`);
      for (const subtopic of subtopics) activate.run(nextTopicPosition(db, parent.areaId), subtopic.id);

      const carry = db.prepare(
        `INSERT OR REPLACE INTO overrides (post_id, topic_id, action, created_at) VALUES (?, ?, ?, ?)`,
      );
      const fixes = db.prepare(`SELECT post_id, action FROM overrides WHERE topic_id = ?`).all(parent.id);
      const added = new Set<string>();
      for (const fix of fixes) {
        const postId = String(fix.post_id);
        if (fix.action === 'remove') {
          for (const subtopic of subtopics) carry.run(postId, subtopic.id, 'remove', now);
        } else if (fix.action === 'add') {
          carry.run(postId, best(postId), 'add', now);
          added.add(postId);
        }
      }
      for (const { postId } of members) {
        if (added.has(postId)) continue;
        if (subtopics.every((subtopic) => score(subtopic.id, postId) < bands.unsure)) {
          carry.run(postId, best(postId), 'unsure', now);
        }
      }

      db.prepare(`UPDATE topics SET state = 'split', last_match_json = ?, updated_at = ? WHERE id = ?`).run(
        JSON.stringify(parentConfident),
        now,
        parent.id,
      );
      const snapshot: SplitSnapshot = { parentId: parent.id, subtopicIds: subtopics.map((subtopic) => subtopic.id) };
      const changeId = logChange(db, deps, {
        kind: CHANGE_KIND.split,
        summary: `Split ${parent.name} into ${subtopics.map((subtopic) => subtopic.name).join(', ')}`,
        postCount: members.length,
        snapshot,
        topics: [[parent.id, 'split'], ...subtopics.map((subtopic): [number, string] => [subtopic.id, 'created'])],
      });
      recordAttempt(db, deps, { ...attempt, outcome: 'applied', changeId });
      return 'applied';
    });
  } finally {
    db.prepare(`DELETE FROM topics WHERE split_from = ? AND state = 'proposed'`).run(parent.id);
  }
}
