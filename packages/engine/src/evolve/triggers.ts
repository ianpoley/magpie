import { DISCOVERY, EVOLUTION } from '../config.ts';
import type { Store } from '../store/db.ts';

export const ATTEMPT_KIND = { newTopic: 'new_topic', split: 'split' } as const;

export type NewTopicTrigger = {
  fire: boolean;
  eligible: string[];
  shown: string[];
};

export function newTopicTrigger(db: Store): NewTopicTrigger {
  const rows = db
    .prepare(
      `SELECT u.post_id,
         EXISTS (SELECT 1 FROM proposal_seen_posts s WHERE s.post_id = u.post_id) AS seen
       FROM post_unfiled u
       WHERE u.post_id NOT IN (SELECT post_id FROM post_pending)
       ORDER BY u.post_id`,
    )
    .all();
  const eligible = rows.map((row) => String(row.post_id));
  const unseen = rows.filter((row) => row.seen === 0).map((row) => String(row.post_id));
  const seen = rows.filter((row) => row.seen !== 0).map((row) => String(row.post_id));
  const shown = [...unseen, ...seen].slice(0, DISCOVERY.batchSize);

  let fire = eligible.length >= EVOLUTION.newTopicTrigger;
  if (fire) {
    const last = db
      .prepare(`SELECT outcome, unfiled_count FROM proposal_attempts WHERE kind = ? ORDER BY id DESC LIMIT 1`)
      .get(ATTEMPT_KIND.newTopic);
    if (last && last.outcome !== 'applied') {
      fire =
        unseen.length >= EVOLUTION.newTopicTrigger &&
        eligible.length >= Number(last.unfiled_count) * EVOLUTION.regrowFactor;
    }
  }
  return { fire, eligible, shown };
}

export type BroadTopic = { id: number; name: string; definition: string; areaId: number | null; confident: number };

export function tooBroadTopics(db: Store): BroadTopic[] {
  const visible = Number(db.prepare(`SELECT COUNT(*) AS n FROM visible_posts`).get()?.n);
  const limit = Math.max(EVOLUTION.tooBroadMinPosts, EVOLUTION.tooBroadCorpusFraction * visible);
  const lastAttempt = db.prepare(
    `SELECT outcome, proposal_json FROM proposal_attempts WHERE kind = ? AND topic_id = ? ORDER BY id DESC LIMIT 1`,
  );
  return db
    .prepare(
      `SELECT t.id, t.name, t.definition, t.area_id, COUNT(*) AS confident
       FROM topic_membership m JOIN topics t ON t.id = m.topic_id
       WHERE m.band = 'confident' AND t.kind = 'auto' AND t.state = 'active' AND t.locked = 0
       GROUP BY t.id
       HAVING COUNT(*) > ?
       ORDER BY t.id`,
    )
    .all(limit)
    .map((row) => ({
      id: Number(row.id),
      name: String(row.name),
      definition: String(row.definition),
      areaId: row.area_id === null ? null : Number(row.area_id),
      confident: Number(row.confident),
    }))
    .filter((topic) => {
      const last = lastAttempt.get(ATTEMPT_KIND.split, topic.id);
      if (!last || last.outcome === 'applied') return true;
      const before = Number(JSON.parse(String(last.proposal_json)).parentConfident);
      return topic.confident >= before * EVOLUTION.regrowFactor;
    });
}
