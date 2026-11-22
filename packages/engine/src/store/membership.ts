import type { DatabaseSync } from 'node:sqlite';

import { BANDS } from '../config.ts';

export const MEMBERSHIP_VIEWS = `
  INSERT OR IGNORE INTO meta (key, value) VALUES ('band_confident', '0.7'), ('band_unsure', '0.3');

  CREATE VIEW visible_posts AS
  SELECT id FROM posts WHERE (bookmarked = 1 OR liked = 1) AND removed_at IS NULL;

  CREATE VIEW scoring_topics AS
  WITH RECURSIVE chain (topic_id, target_id) AS (
    SELECT id, id FROM topics WHERE state = 'active'
    UNION ALL
    SELECT t.id, chain.target_id
    FROM topics t JOIN chain ON t.merged_into = chain.topic_id
    WHERE t.state = 'merged'
  )
  SELECT topic_id, target_id FROM chain;

  CREATE VIEW pairs_to_score AS
  WITH page_resolved AS (
    SELECT pl.post_id, MAX(l.resolved_at) AS at
    FROM post_links pl JOIN links l ON l.url = pl.link_url
    WHERE l.status = 'resolved' AND (l.title IS NOT NULL OR l.description IS NOT NULL)
    GROUP BY pl.post_id
  )
  SELECT p.id AS post_id, st.topic_id
  FROM visible_posts p
  CROSS JOIN scoring_topics st
  LEFT JOIN scores s ON s.post_id = p.id AND s.topic_id = st.topic_id
  LEFT JOIN page_resolved pr ON pr.post_id = p.id
  WHERE s.post_id IS NULL OR pr.at > s.scored_at;

  CREATE VIEW topic_membership AS
  WITH thresholds AS (
    SELECT
      (SELECT CAST(value AS REAL) FROM meta WHERE key = 'band_confident') AS confident,
      (SELECT CAST(value AS REAL) FROM meta WHERE key = 'band_unsure') AS unsure
  ),
  claims AS (
    SELECT s.post_id, st.target_id AS topic_id, s.probability, 0 AS added, 0 AS carried
    FROM scores s
    JOIN scoring_topics st ON st.topic_id = s.topic_id
    WHERE NOT EXISTS (
      SELECT 1 FROM overrides o
      WHERE o.post_id = s.post_id AND o.topic_id = s.topic_id AND o.action = 'remove'
    )
    UNION ALL
    SELECT o.post_id, st.target_id, NULL, o.action = 'add', o.action = 'unsure'
    FROM overrides o
    JOIN scoring_topics st ON st.topic_id = o.topic_id
    WHERE o.action IN ('add', 'unsure')
  ),
  best AS (
    SELECT post_id, topic_id,
      MAX(probability) AS probability,
      MAX(added) AS added,
      MAX(carried) AS carried
    FROM claims
    GROUP BY post_id, topic_id
  )
  SELECT
    b.post_id,
    b.topic_id,
    t.area_id,
    CASE WHEN b.added = 1 OR b.probability >= th.confident THEN 'confident' ELSE 'unsure' END AS band,
    b.probability,
    CASE WHEN b.added = 1 THEN 1.0 ELSE COALESCE(b.probability, 0.0) END AS strength,
    CASE WHEN t.hidden = 1 OR a.hidden = 1 THEN 1 ELSE 0 END AS hidden,
    CASE WHEN t.kind = 'pinned' THEN 1 ELSE 0 END AS pinned
  FROM best b
  JOIN visible_posts p ON p.id = b.post_id
  JOIN topics t ON t.id = b.topic_id
  LEFT JOIN areas a ON a.id = t.area_id
  CROSS JOIN thresholds th
  WHERE (b.added = 1 OR b.carried = 1 OR b.probability >= th.unsure)
    AND NOT EXISTS (
      SELECT 1 FROM overrides o
      WHERE o.post_id = b.post_id AND o.topic_id = b.topic_id AND o.action = 'remove'
    );

  CREATE VIEW membership_standing AS
  SELECT post_id, topic_id, area_id, band, probability, strength, hidden, pinned,
    MAX(band = 'confident') OVER post AS post_filed,
    (MAX(pinned = 0) OVER post = 1
     AND MAX(pinned = 0 AND band = 'confident' AND hidden = 0) OVER post = 0
     AND (MAX(pinned = 0 AND band = 'confident' AND hidden = 1) OVER post = 1
          OR COALESCE(MAX(CASE WHEN pinned = 0 AND hidden = 1 THEN strength END) OVER post, -1)
           > COALESCE(MAX(CASE WHEN pinned = 0 AND hidden = 0 THEN strength END) OVER post, -1))) AS post_hidden
  FROM topic_membership
  WINDOW post AS (PARTITION BY post_id);

  CREATE VIEW post_unfiled AS
  SELECT p.id AS post_id FROM visible_posts p
  WHERE p.id NOT IN (SELECT post_id FROM membership_standing WHERE post_filed = 1);

  CREATE VIEW post_hidden AS
  SELECT DISTINCT post_id FROM membership_standing WHERE post_hidden = 1;

  CREATE VIEW post_pending AS
  SELECT post_id FROM pairs_to_score
  UNION
  SELECT pl.post_id
  FROM post_links pl
  JOIN links l ON l.url = pl.link_url
  JOIN visible_posts p ON p.id = pl.post_id
  WHERE l.status IN ('new', 'failed');
`;

export function syncBands(
  db: DatabaseSync,
  bands: { confident: number; unsure: number } = BANDS,
): void {
  const set = db.prepare(
    `INSERT INTO meta (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value WHERE value <> excluded.value`,
  );
  set.run('band_confident', String(bands.confident));
  set.run('band_unsure', String(bands.unsure));
}
