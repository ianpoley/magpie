import { EVOLUTION } from '../config.ts';
import type { Store } from '../store/db.ts';

export const key = (name: string): string => name.trim().toLowerCase();

export function confidentPostIds(db: Store, topicIds: number[]): Map<number, string[]> {
  const byTopic = new Map<number, string[]>(topicIds.map((id) => [id, []]));
  if (topicIds.length === 0) return byTopic;
  const rows = db
    .prepare(
      `SELECT topic_id, post_id FROM topic_membership
       WHERE band = 'confident' AND topic_id IN (${topicIds.map(() => '?').join(', ')})
       ORDER BY post_id`,
    )
    .all(...topicIds);
  for (const row of rows) byTopic.get(Number(row.topic_id))?.push(String(row.post_id));
  return byTopic;
}

export function suppressProposal(
  db: Store,
  proposal: { name: string; definition: string; matches: string[]; topicId: number; changeId: number },
  now: string,
): void {
  db.prepare(
    `INSERT INTO suppressed_proposals (name, definition, match_set_json, reason, topic_id, change_id, created_at)
     VALUES (?, ?, ?, 'undone', ?, ?, ?)`,
  ).run(proposal.name, proposal.definition, JSON.stringify(proposal.matches), proposal.topicId, proposal.changeId, now);
}

export function takenTopicNames(db: Store): { inUse: Set<string>; blocked: Set<string> } {
  const inUse = new Set<string>();
  const blocked = new Set<string>();
  for (const row of db.prepare(`SELECT name, state FROM topics WHERE state IN ('active', 'merged', 'split', 'deleted')`).all()) {
    (row.state === 'deleted' ? blocked : inUse).add(key(String(row.name)));
  }
  for (const row of db.prepare(`SELECT name FROM suppressed_proposals`).all()) blocked.add(key(String(row.name)));
  return { inUse, blocked };
}

export function isDeletedAreaName(db: Store, name: string): boolean {
  return Boolean(
    db.prepare(`SELECT 1 FROM areas WHERE state = 'deleted' AND lower(name) = ? LIMIT 1`).get(key(name)),
  );
}

function parseIds(json: unknown): string[] {
  if (typeof json !== 'string') return [];
  try {
    const value = JSON.parse(json);
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
}

export function overlapsTombstone(db: Store, matches: string[]): boolean {
  if (matches.length === 0) return false;
  const sets = [
    ...db.prepare(`SELECT last_match_json AS ids FROM topics WHERE state = 'deleted'`).all(),
    ...db.prepare(`SELECT match_set_json AS ids FROM suppressed_proposals`).all(),
  ];
  for (const row of sets) {
    const tombstone = new Set(parseIds(row.ids));
    const shared = matches.filter((id) => tombstone.has(id)).length;
    if (shared / matches.length > EVOLUTION.tombstoneOverlap) return true;
  }
  return false;
}
