import type { Store } from '../store/db.ts';
import { suppressProposal } from './tombstones.ts';

export const CHANGE_KIND = { newTopic: 'new_topic', split: 'split', undo: 'undo' } as const;

export type NewTopicSnapshot = { topicId: number; areaId: number; areaCreated: boolean };
export type SplitSnapshot = { parentId: number; subtopicIds: number[] };

export type LoggedChange = {
  id: number;
  kind: string;
  summary: string;
  postCount: number;
  createdAt: string;
  restores: string[];
};

type ChangeRow = Record<string, unknown>;

function createdTopicIds(change: ChangeRow): number[] {
  const snapshot = JSON.parse(String(change.snapshot_json));
  if (change.kind === CHANGE_KIND.newTopic) return [(snapshot as NewTopicSnapshot).topicId];
  if (change.kind === CHANGE_KIND.split) return (snapshot as SplitSnapshot).subtopicIds;
  return [];
}

type MergedTopic = { id: number; name: string };

function createdBy(changes: ChangeRow[]): Map<number, number> {
  const created = new Map<number, number>();
  for (const change of changes) {
    for (const topicId of createdTopicIds(change)) created.set(topicId, Number(change.id));
  }
  return created;
}

function mergedInto(
  db: Store,
  topicId: number,
  created: Map<number, number>,
): { own: MergedTopic[]; made: MergedTopic[] } {
  const read = db.prepare(`SELECT id, name FROM topics WHERE merged_into = ? AND state = 'merged' ORDER BY id`);
  const own: MergedTopic[] = [];
  const made: MergedTopic[] = [];
  const reached = new Set([topicId]);
  const pending = [topicId];
  for (const targetId of pending) {
    for (const row of read.all(targetId)) {
      const merged = { id: Number(row.id), name: String(row.name) };
      if (reached.has(merged.id)) continue;
      reached.add(merged.id);
      if (created.has(merged.id)) {
        made.push(merged);
        pending.push(merged.id);
      } else {
        own.push(merged);
      }
    }
  }
  return { own, made };
}

export function undoChain(db: Store, changeId: number): LoggedChange[] {
  const read = db.prepare(`SELECT id, kind, summary, post_count, created_at, snapshot_json FROM changes WHERE id = ?`);
  const target = read.get(changeId);
  if (!target) return [];
  const topicsOf = db.prepare(`SELECT topic_id FROM change_topics WHERE change_id = ?`);
  const touched = new Set(topicsOf.all(changeId).map((row) => Number(row.topic_id)));
  const chain = [target];
  const later = db
    .prepare(
      `SELECT id, kind, summary, post_count, created_at, snapshot_json FROM changes
       WHERE id > ? AND source = 'auto' AND undoable = 1 AND undone_at IS NULL
       ORDER BY id`,
    )
    .all(changeId);
  for (const change of later) {
    const topics = topicsOf.all(change.id).map((row) => Number(row.topic_id));
    if (!topics.some((id) => touched.has(id))) continue;
    chain.push(change);
    for (const id of topics) touched.add(id);
  }
  const state = db.prepare(`SELECT state FROM topics WHERE id = ?`);
  const created = createdBy(chain);
  return chain.reverse().map((row) => ({
    id: Number(row.id),
    kind: String(row.kind),
    summary: String(row.summary),
    postCount: Number(row.post_count),
    createdAt: String(row.created_at),
    restores: createdTopicIds(row)
      .filter((topicId) => state.get(topicId)?.state === 'active')
      .flatMap((topicId) => mergedInto(db, topicId, created).own.map((topic) => topic.name)),
  }));
}

function removeCreatedTopics(
  db: Store,
  topicIds: number[],
  changeId: number,
  created: Map<number, number>,
  now: string,
): void {
  const read = db.prepare(`SELECT name, definition, state FROM topics WHERE id = ?`);
  const remove = db.prepare(
    `UPDATE topics SET state = 'removed', merged_into = NULL, locked = 1, updated_at = ? WHERE id = ?`,
  );
  const ownMatches = db.prepare(
    `SELECT s.post_id FROM scores s
     WHERE s.topic_id = ? AND s.post_id IN (SELECT id FROM visible_posts)
       AND s.probability >= (SELECT CAST(value AS REAL) FROM meta WHERE key = 'band_confident')
     ORDER BY s.post_id`,
  );
  const copyFixes = db.prepare(
    `WITH RECURSIVE sources (id) AS (
       SELECT :restored
       UNION
       SELECT t.id FROM topics t JOIN sources s ON t.merged_into = s.id WHERE t.state = 'merged'
     )
     INSERT OR IGNORE INTO overrides (post_id, topic_id, action, created_at)
     SELECT post_id, :restored, action, created_at FROM overrides
     WHERE topic_id = :holder AND action IN ('add', 'remove')
       AND (merged_from IS NULL OR merged_from IN (SELECT id FROM sources))`,
  );
  const restore = db.prepare(
    `UPDATE topics SET state = 'active', merged_into = NULL, locked = 1, updated_at = ? WHERE id = ?`,
  );
  for (const topicId of topicIds) {
    if (read.get(topicId)?.state !== 'active') continue;
    const merged = mergedInto(db, topicId, created);
    for (const own of merged.own) {
      copyFixes.run({ restored: own.id, holder: topicId });
      restore.run(now, own.id);
    }
    for (const id of [topicId, ...merged.made.map((topic) => topic.id)]) {
      const topic = read.get(id);
      suppressProposal(
        db,
        {
          name: String(topic?.name),
          definition: String(topic?.definition),
          matches: ownMatches.all(id).map((row) => String(row.post_id)),
          topicId: id,
          changeId: created.get(id) ?? changeId,
        },
        now,
      );
      remove.run(now, id);
    }
  }
}

function reverse(db: Store, change: LoggedChange, created: Map<number, number>, now: string): void {
  const row = db.prepare(`SELECT snapshot_json FROM changes WHERE id = ?`).get(change.id);
  const snapshot = JSON.parse(String(row?.snapshot_json));
  if (change.kind === CHANGE_KIND.newTopic) {
    const { topicId, areaId, areaCreated } = snapshot as NewTopicSnapshot;
    removeCreatedTopics(db, [topicId], change.id, created, now);
    if (areaCreated) {
      db.prepare(
        `DELETE FROM areas WHERE id = ? AND locked = 0
         AND NOT EXISTS (SELECT 1 FROM topics WHERE area_id = areas.id AND state IN ('active', 'merged', 'split'))`,
      ).run(areaId);
    }
  } else if (change.kind === CHANGE_KIND.split) {
    const { parentId, subtopicIds } = snapshot as SplitSnapshot;
    removeCreatedTopics(db, subtopicIds, change.id, created, now);
    db.prepare(
      `UPDATE topics SET state = 'active', locked = 1, last_match_json = NULL, updated_at = ?
       WHERE id = ? AND state = 'split'`,
    ).run(now, parentId);
  } else {
    throw new Error(`Change ${change.id} of kind ${change.kind} cannot be reversed`);
  }
}

export function reverseChanges(db: Store, chain: LoggedChange[], now: string): number {
  const target = chain[chain.length - 1];
  const undo = db
    .prepare(
      `INSERT INTO changes (kind, source, summary, post_count, undoable, created_at)
       VALUES (?, 'user', ?, ?, 0, ?)`,
    )
    .run(CHANGE_KIND.undo, `Undid: ${target.summary}`, target.postCount, now);
  const undoId = Number(undo.lastInsertRowid);
  const mark = db.prepare(`UPDATE changes SET undone_at = ?, undone_by = ? WHERE id = ?`);
  const snapshot = db.prepare(`SELECT id, kind, snapshot_json FROM changes WHERE id = ?`);
  const created = createdBy(
    chain.flatMap((change) => {
      const row = snapshot.get(change.id);
      return row ? [row] : [];
    }),
  );
  for (const change of chain) {
    reverse(db, change, created, now);
    mark.run(now, undoId, change.id);
  }
  return undoId;
}
