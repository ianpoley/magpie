import { confidentPostIds } from '../evolve/tombstones.ts';
import { reverseChanges, undoChain } from '../evolve/undo.ts';
import type { LoggedChange } from '../evolve/undo.ts';
import { transaction } from './db.ts';
import type { Store } from './db.ts';

export type EditErrorCode =
  | 'unknown_topic'
  | 'unknown_area'
  | 'unknown_post'
  | 'unknown_change'
  | 'not_active'
  | 'invalid_name'
  | 'invalid_score'
  | 'merge_into_self'
  | 'pinned_target'
  | 'not_pinned'
  | 'system_area'
  | 'not_undoable'
  | 'already_undone';

export class EditError extends Error {
  code: EditErrorCode;

  constructor(code: EditErrorCode, message: string) {
    super(message);
    this.name = 'EditError';
    this.code = code;
  }
}

export const PINNED_AREA_NAME = 'Pinned';

export type PinScore = { postId: string; probability: number };
export type UndoResult = { changeId: number; undone: LoggedChange[] };

const timestamp = (): string => new Date().toISOString();

function cleanName(name: string): string {
  const cleaned = name.replace(/\s+/g, ' ').trim();
  if (!cleaned) throw new EditError('invalid_name', 'A name cannot be empty.');
  return cleaned;
}

function activeTopic(db: Store, topicId: number): { id: number; kind: string } {
  const row = db.prepare(`SELECT id, kind, state FROM topics WHERE id = ?`).get(topicId);
  if (!row) throw new EditError('unknown_topic', `Topic ${topicId} does not exist.`);
  if (row.state !== 'active') throw new EditError('not_active', `Topic ${topicId} is no longer in use.`);
  return { id: Number(row.id), kind: String(row.kind) };
}

function editableArea(db: Store, areaId: number): number {
  const row = db.prepare(`SELECT id, kind, state FROM areas WHERE id = ?`).get(areaId);
  if (!row) throw new EditError('unknown_area', `Area ${areaId} does not exist.`);
  if (row.state !== 'active') throw new EditError('not_active', `Area ${areaId} is no longer in use.`);
  if (row.kind === 'system') throw new EditError('system_area', 'This area is built in and cannot be edited.');
  return Number(row.id);
}

function knownPost(db: Store, postId: string): void {
  if (!db.prepare(`SELECT 1 FROM posts WHERE id = ?`).get(postId)) {
    throw new EditError('unknown_post', `Post ${postId} does not exist.`);
  }
}

export function renameTopic(db: Store, topicId: number, name: string): { topicId: number; name: string } {
  return transaction(db, () => {
    const cleaned = cleanName(name);
    activeTopic(db, topicId);
    db.prepare(`UPDATE topics SET name = ?, locked = 1, updated_at = ? WHERE id = ?`).run(cleaned, timestamp(), topicId);
    return { topicId, name: cleaned };
  });
}

export function renameArea(db: Store, areaId: number, name: string): { areaId: number; name: string } {
  return transaction(db, () => {
    const cleaned = cleanName(name);
    editableArea(db, areaId);
    db.prepare(`UPDATE areas SET name = ?, locked = 1, updated_at = ? WHERE id = ?`).run(cleaned, timestamp(), areaId);
    return { areaId, name: cleaned };
  });
}

export function mergeTopics(db: Store, fromId: number, intoId: number): { fromId: number; intoId: number } {
  return transaction(db, () => {
    if (fromId === intoId) throw new EditError('merge_into_self', 'A topic cannot be merged into itself.');
    activeTopic(db, fromId);
    if (activeTopic(db, intoId).kind === 'pinned') {
      throw new EditError('pinned_target', 'A topic cannot be merged into a pinned search.');
    }
    const now = timestamp();
    db.prepare(
      `DELETE FROM overrides WHERE topic_id = ? AND post_id IN (SELECT post_id FROM overrides WHERE topic_id = ?)`,
    ).run(fromId, intoId);
    db.prepare(`UPDATE overrides SET topic_id = ? WHERE topic_id = ?`).run(intoId, fromId);
    db.prepare(
      `UPDATE topics SET state = 'merged', merged_into = ?, locked = 1, updated_at = ? WHERE id = ?`,
    ).run(intoId, now, fromId);
    db.prepare(`UPDATE topics SET locked = 1, updated_at = ? WHERE id = ?`).run(now, intoId);
    return { fromId, intoId };
  });
}

function removePinned(db: Store, topicId: number): void {
  db.prepare(`DELETE FROM topics WHERE id = ?`).run(topicId);
}

function tombstoneTopics(db: Store, topicIds: number[], now: string): void {
  const matches = confidentPostIds(db, topicIds);
  const tombstone = db.prepare(
    `UPDATE topics SET state = 'deleted', locked = 1, last_match_json = ?, updated_at = ? WHERE id = ?`,
  );
  for (const topicId of topicIds) tombstone.run(JSON.stringify(matches.get(topicId) ?? []), now, topicId);
}

export function deleteTopic(db: Store, topicId: number): { topicId: number } {
  return transaction(db, () => {
    const topic = activeTopic(db, topicId);
    if (topic.kind === 'pinned') removePinned(db, topicId);
    else tombstoneTopics(db, [topicId], timestamp());
    return { topicId };
  });
}

export function deleteArea(db: Store, areaId: number): { areaId: number; topicIds: number[] } {
  return transaction(db, () => {
    editableArea(db, areaId);
    const now = timestamp();
    const topicIds = db
      .prepare(`SELECT id FROM topics WHERE area_id = ? AND state = 'active' ORDER BY id`)
      .all(areaId)
      .map((row) => Number(row.id));
    tombstoneTopics(db, topicIds, now);
    db.prepare(
      `UPDATE topics SET state = 'deleted', locked = 1, updated_at = ? WHERE area_id = ? AND state = 'split'`,
    ).run(now, areaId);
    db.prepare(`UPDATE areas SET state = 'deleted', locked = 1, updated_at = ? WHERE id = ?`).run(now, areaId);
    return { areaId, topicIds };
  });
}

export function setTopicHidden(db: Store, topicId: number, hidden: boolean): { topicId: number; hidden: boolean } {
  return transaction(db, () => {
    activeTopic(db, topicId);
    db.prepare(`UPDATE topics SET hidden = ?, locked = 1, updated_at = ? WHERE id = ?`).run(
      hidden ? 1 : 0,
      timestamp(),
      topicId,
    );
    return { topicId, hidden };
  });
}

export function setAreaHidden(db: Store, areaId: number, hidden: boolean): { areaId: number; hidden: boolean } {
  return transaction(db, () => {
    editableArea(db, areaId);
    db.prepare(`UPDATE areas SET hidden = ?, locked = 1, updated_at = ? WHERE id = ?`).run(
      hidden ? 1 : 0,
      timestamp(),
      areaId,
    );
    return { areaId, hidden };
  });
}

function setPostFix(db: Store, postId: string, topicId: number, action: 'add' | 'remove'): void {
  transaction(db, () => {
    knownPost(db, postId);
    activeTopic(db, topicId);
    db.prepare(
      `INSERT INTO overrides (post_id, topic_id, action, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (post_id, topic_id) DO UPDATE SET action = excluded.action, created_at = excluded.created_at`,
    ).run(postId, topicId, action, timestamp());
  });
}

export function addPostTopic(db: Store, postId: string, topicId: number): { postId: string; topicId: number } {
  setPostFix(db, postId, topicId, 'add');
  return { postId, topicId };
}

export function removePostTopic(db: Store, postId: string, topicId: number): { postId: string; topicId: number } {
  setPostFix(db, postId, topicId, 'remove');
  return { postId, topicId };
}

export function removePost(db: Store, postId: string): { postId: string } {
  return transaction(db, () => {
    knownPost(db, postId);
    db.prepare(`UPDATE posts SET removed_at = ? WHERE id = ? AND removed_at IS NULL`).run(timestamp(), postId);
    return { postId };
  });
}

export function restorePost(db: Store, postId: string): { postId: string } {
  return transaction(db, () => {
    knownPost(db, postId);
    db.prepare(`UPDATE posts SET removed_at = NULL WHERE id = ?`).run(postId);
    return { postId };
  });
}

export function pinQuery(
  db: Store,
  pin: { query: string; scores: PinScore[] },
): { topicId: number; areaId: number } {
  return transaction(db, () => {
    const query = cleanName(pin.query);
    for (const { postId, probability } of pin.scores) {
      knownPost(db, postId);
      if (typeof probability !== 'number' || !(probability >= 0 && probability <= 1)) {
        throw new EditError('invalid_score', `Post ${postId} has a score outside 0 to 1.`);
      }
    }
    const now = timestamp();
    const existing = db
      .prepare(`SELECT id FROM areas WHERE kind = 'system' AND name = ? AND state = 'active'`)
      .get(PINNED_AREA_NAME);
    const areaId = Number(
      existing
        ? existing.id
        : db
            .prepare(`INSERT INTO areas (name, kind, locked, created_at) VALUES (?, 'system', 1, ?)`)
            .run(PINNED_AREA_NAME, now).lastInsertRowid,
    );
    const topicId = Number(
      db
        .prepare(
          `INSERT INTO topics (area_id, name, definition, kind, state, locked, query, created_at)
           VALUES (?, ?, ?, 'pinned', 'active', 1, ?, ?)`,
        )
        .run(areaId, query, query, query, now).lastInsertRowid,
    );
    const write = db.prepare(
      `INSERT OR REPLACE INTO scores (post_id, topic_id, probability, scored_at) VALUES (?, ?, ?, ?)`,
    );
    for (const { postId, probability } of pin.scores) write.run(postId, topicId, probability, now);
    return { topicId, areaId };
  });
}

export function unpin(db: Store, topicId: number): { topicId: number } {
  return transaction(db, () => {
    const topic = activeTopic(db, topicId);
    if (topic.kind !== 'pinned') throw new EditError('not_pinned', `Topic ${topicId} is not a pinned search.`);
    removePinned(db, topicId);
    return { topicId };
  });
}

function undoableChain(db: Store, changeId: number): LoggedChange[] {
  const change = db.prepare(`SELECT source, undoable, undone_at FROM changes WHERE id = ?`).get(changeId);
  if (!change) throw new EditError('unknown_change', `Change ${changeId} does not exist.`);
  if (change.undone_at !== null) throw new EditError('already_undone', `Change ${changeId} was already undone.`);
  if (change.source !== 'auto' || change.undoable !== 1) {
    throw new EditError('not_undoable', `Change ${changeId} cannot be undone.`);
  }
  return undoChain(db, changeId);
}

export function listUndo(db: Store, changeId: number): LoggedChange[] {
  return undoableChain(db, changeId);
}

export function undoChange(db: Store, changeId: number): UndoResult {
  return transaction(db, () => {
    const undone = undoableChain(db, changeId);
    return { changeId: reverseChanges(db, undone, timestamp()), undone };
  });
}
