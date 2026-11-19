import type { Store } from '../store/db.ts';
import { confidentPostIds, suppressProposal } from './tombstones.ts';

export const CHANGE_KIND = { newTopic: 'new_topic', split: 'split', undo: 'undo' } as const;

/** What a logged change stores so it can be reversed. */
export type NewTopicSnapshot = { topicId: number; areaId: number; areaCreated: boolean };
export type SplitSnapshot = { parentId: number; subtopicIds: number[] };

export type LoggedChange = {
  id: number;
  kind: string;
  summary: string;
  postCount: number;
  createdAt: string;
};

/**
 * Every change that undoing `changeId` reverses, newest first: the change
 * itself, then each later automatic change still in effect that touched a
 * topic one of them touched. Empty when the change does not exist.
 */
export function undoChain(db: Store, changeId: number): LoggedChange[] {
  const read = db.prepare(`SELECT id, kind, summary, post_count, created_at FROM changes WHERE id = ?`);
  const target = read.get(changeId);
  if (!target) return [];
  const topicsOf = db.prepare(`SELECT topic_id FROM change_topics WHERE change_id = ?`);
  const touched = new Set(topicsOf.all(changeId).map((row) => Number(row.topic_id)));
  const chain = [target];
  const later = db
    .prepare(
      `SELECT id, kind, summary, post_count, created_at FROM changes
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
  return chain.reverse().map((row) => ({
    id: Number(row.id),
    kind: String(row.kind),
    summary: String(row.summary),
    postCount: Number(row.post_count),
    createdAt: String(row.created_at),
  }));
}

/** Takes topics an automatic change created out of use and keeps them from being proposed again. */
function removeCreatedTopics(db: Store, topicIds: number[], changeId: number, now: string): void {
  const read = db.prepare(`SELECT name, definition, state FROM topics WHERE id = ?`);
  const remove = db.prepare(`UPDATE topics SET state = 'removed', locked = 1, updated_at = ? WHERE id = ?`);
  const matches = confidentPostIds(db, topicIds);
  for (const topicId of topicIds) {
    const topic = read.get(topicId);
    if (!topic || topic.state !== 'active') continue;
    suppressProposal(
      db,
      {
        name: String(topic.name),
        definition: String(topic.definition),
        matches: matches.get(topicId) ?? [],
        topicId,
        changeId,
      },
      now,
    );
    remove.run(now, topicId);
  }
}

function reverse(db: Store, change: LoggedChange, now: string): void {
  const row = db.prepare(`SELECT snapshot_json FROM changes WHERE id = ?`).get(change.id);
  const snapshot = JSON.parse(String(row?.snapshot_json));
  if (change.kind === CHANGE_KIND.newTopic) {
    const { topicId, areaId, areaCreated } = snapshot as NewTopicSnapshot;
    removeCreatedTopics(db, [topicId], change.id, now);
    if (areaCreated) {
      db.prepare(
        `DELETE FROM areas WHERE id = ? AND locked = 0
         AND NOT EXISTS (SELECT 1 FROM topics WHERE area_id = areas.id AND state IN ('active', 'merged', 'split'))`,
      ).run(areaId);
    }
  } else if (change.kind === CHANGE_KIND.split) {
    const { parentId, subtopicIds } = snapshot as SplitSnapshot;
    removeCreatedTopics(db, subtopicIds, change.id, now);
    db.prepare(
      `UPDATE topics SET state = 'active', locked = 1, last_match_json = NULL, updated_at = ?
       WHERE id = ? AND state = 'split'`,
    ).run(now, parentId);
  } else {
    throw new Error(`Change ${change.id} of kind ${change.kind} cannot be reversed`);
  }
}

/**
 * Reverses `chain` in the order given and logs the undo. Posts return to where
 * the membership view puts them once the topics change state; nothing is
 * scored here. The caller runs this inside one transaction. Returns the id of
 * the log entry for the undo.
 */
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
  for (const change of chain) {
    reverse(db, change, now);
    mark.run(now, undoId, change.id);
  }
  return undoId;
}
