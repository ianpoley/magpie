-- The store schema exactly as schema version 2 created it. Frozen: never regenerate from newer code.
CREATE TABLE meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  ) WITHOUT ROWID;
CREATE TABLE posts (
    id                TEXT PRIMARY KEY,
    text              TEXT NOT NULL,
    created_at        TEXT,
    url               TEXT NOT NULL,
    author_id         TEXT,
    author_handle     TEXT NOT NULL,
    author_name       TEXT NOT NULL,
    author_avatar_url TEXT,
    author_avatar_hue INTEGER,
    like_count        INTEGER NOT NULL DEFAULT 0,
    reply_to_id       TEXT,
    quoted_json       TEXT,
    media_json        TEXT NOT NULL DEFAULT '[]',
    entities_json     TEXT NOT NULL DEFAULT '{}',
    bookmarked        INTEGER NOT NULL DEFAULT 0,
    liked             INTEGER NOT NULL DEFAULT 0,
    first_seen_at     TEXT NOT NULL
  ) WITHOUT ROWID;
CREATE INDEX posts_author_handle ON posts (author_handle);
CREATE TABLE resources (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    canonical_key       TEXT NOT NULL UNIQUE,
    kind                TEXT NOT NULL,
    url                 TEXT NOT NULL,
    host                TEXT,
    title               TEXT,
    description         TEXT,
    homepage_url        TEXT,
    homepage_status     TEXT,
    homepage_checked_at TEXT,
    created_at          TEXT NOT NULL
  );
CREATE TABLE resource_aliases (
    alias_key   TEXT PRIMARY KEY,
    resource_id INTEGER NOT NULL REFERENCES resources (id) ON DELETE CASCADE,
    kind        TEXT NOT NULL,
    created_at  TEXT NOT NULL
  ) WITHOUT ROWID;
CREATE INDEX resource_aliases_resource ON resource_aliases (resource_id);
CREATE TABLE links (
    url             TEXT PRIMARY KEY,
    expanded_url    TEXT,
    status          TEXT NOT NULL DEFAULT 'new',
    final_url       TEXT,
    host            TEXT,
    title           TEXT,
    description     TEXT,
    resource_id     INTEGER REFERENCES resources (id) ON DELETE SET NULL,
    attempts        INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TEXT,
    next_attempt_at TEXT,
    resolved_at     TEXT,
    last_error      TEXT,
    first_seen_at   TEXT NOT NULL
  ) WITHOUT ROWID;
CREATE INDEX links_status ON links (status, next_attempt_at);
CREATE INDEX links_resource ON links (resource_id);
CREATE TABLE post_links (
    post_id  TEXT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
    link_url TEXT NOT NULL REFERENCES links (url) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (post_id, link_url)
  ) WITHOUT ROWID;
CREATE INDEX post_links_link ON post_links (link_url);
CREATE TABLE areas (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    kind       TEXT NOT NULL DEFAULT 'auto',
    is_dev     INTEGER NOT NULL DEFAULT 1,
    hidden     INTEGER NOT NULL DEFAULT 0,
    locked     INTEGER NOT NULL DEFAULT 0,
    state      TEXT NOT NULL DEFAULT 'active',
    position   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT
  );
CREATE TABLE topics (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    area_id         INTEGER REFERENCES areas (id) ON DELETE SET NULL,
    name            TEXT NOT NULL,
    definition      TEXT NOT NULL,
    kind            TEXT NOT NULL DEFAULT 'auto',
    state           TEXT NOT NULL DEFAULT 'active',
    locked          INTEGER NOT NULL DEFAULT 0,
    hidden          INTEGER NOT NULL DEFAULT 0,
    merged_into     INTEGER REFERENCES topics (id) ON DELETE SET NULL,
    split_from      INTEGER REFERENCES topics (id) ON DELETE SET NULL,
    query           TEXT,
    last_match_json TEXT,
    position        INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL,
    updated_at      TEXT
  );
CREATE INDEX topics_area ON topics (area_id);
CREATE INDEX topics_state ON topics (state);
CREATE INDEX topics_merged_into ON topics (merged_into);
CREATE TABLE scores (
    post_id     TEXT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
    topic_id    INTEGER NOT NULL REFERENCES topics (id) ON DELETE CASCADE,
    probability REAL NOT NULL,
    scored_at   TEXT NOT NULL,
    PRIMARY KEY (post_id, topic_id)
  ) WITHOUT ROWID;
CREATE INDEX scores_topic ON scores (topic_id);
CREATE TABLE overrides (
    post_id    TEXT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
    topic_id   INTEGER NOT NULL REFERENCES topics (id) ON DELETE CASCADE,
    action     TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (post_id, topic_id)
  ) WITHOUT ROWID;
CREATE INDEX overrides_topic ON overrides (topic_id);
CREATE TABLE runs (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at           TEXT NOT NULL,
    finished_at          TEXT,
    status               TEXT NOT NULL DEFAULT 'running',
    upstream_sync        TEXT NOT NULL DEFAULT 'unknown',
    upstream_sync_detail TEXT,
    message              TEXT
  );
CREATE TABLE run_stages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id      INTEGER NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
    stage       TEXT NOT NULL,
    outcome     TEXT NOT NULL,
    counts_json TEXT NOT NULL DEFAULT '{}',
    message     TEXT,
    started_at  TEXT,
    finished_at TEXT
  );
CREATE INDEX run_stages_run ON run_stages (run_id);
CREATE TABLE changes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    kind          TEXT NOT NULL,
    source        TEXT NOT NULL DEFAULT 'auto',
    summary       TEXT NOT NULL,
    post_count    INTEGER NOT NULL DEFAULT 0,
    snapshot_json TEXT,
    undoable      INTEGER NOT NULL DEFAULT 1,
    undone_at     TEXT,
    undone_by     INTEGER REFERENCES changes (id) ON DELETE SET NULL,
    run_id        INTEGER REFERENCES runs (id) ON DELETE SET NULL,
    created_at    TEXT NOT NULL
  );
CREATE TABLE change_topics (
    change_id INTEGER NOT NULL REFERENCES changes (id) ON DELETE CASCADE,
    topic_id  INTEGER NOT NULL,
    role      TEXT NOT NULL DEFAULT 'affected',
    PRIMARY KEY (change_id, topic_id)
  ) WITHOUT ROWID;
CREATE INDEX change_topics_topic ON change_topics (topic_id);
CREATE TABLE proposal_attempts (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    kind           TEXT NOT NULL,
    outcome        TEXT NOT NULL,
    reason         TEXT,
    topic_id       INTEGER,
    unfiled_count  INTEGER,
    proposal_json  TEXT,
    match_set_json TEXT,
    change_id      INTEGER REFERENCES changes (id) ON DELETE SET NULL,
    run_id         INTEGER REFERENCES runs (id) ON DELETE SET NULL,
    created_at     TEXT NOT NULL
  );
CREATE TABLE proposal_seen_posts (
    post_id    TEXT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
    attempt_id INTEGER NOT NULL REFERENCES proposal_attempts (id) ON DELETE CASCADE,
    PRIMARY KEY (post_id, attempt_id)
  ) WITHOUT ROWID;
CREATE TABLE suppressed_proposals (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL,
    definition     TEXT,
    match_set_json TEXT NOT NULL DEFAULT '[]',
    reason         TEXT,
    topic_id       INTEGER,
    change_id      INTEGER REFERENCES changes (id) ON DELETE SET NULL,
    created_at     TEXT NOT NULL
  );
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
  FROM posts p
  CROSS JOIN scoring_topics st
  LEFT JOIN scores s ON s.post_id = p.id AND s.topic_id = st.topic_id
  LEFT JOIN page_resolved pr ON pr.post_id = p.id
  WHERE (p.bookmarked = 1 OR p.liked = 1)
    AND (s.post_id IS NULL OR pr.at > s.scored_at);
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
  JOIN posts p ON p.id = b.post_id AND (p.bookmarked = 1 OR p.liked = 1)
  JOIN topics t ON t.id = b.topic_id
  LEFT JOIN areas a ON a.id = t.area_id
  CROSS JOIN thresholds th
  WHERE (b.added = 1 OR b.carried = 1 OR b.probability >= th.unsure)
    AND NOT EXISTS (
      SELECT 1 FROM overrides o
      WHERE o.post_id = b.post_id AND o.topic_id = b.topic_id AND o.action = 'remove'
    );
CREATE VIEW post_unfiled AS
  SELECT p.id AS post_id
  FROM posts p
  WHERE (p.bookmarked = 1 OR p.liked = 1)
    AND p.id NOT IN (SELECT post_id FROM topic_membership WHERE band = 'confident');
CREATE VIEW post_hidden AS
  SELECT post_id
  FROM topic_membership
  WHERE pinned = 0
  GROUP BY post_id
  HAVING MAX(band = 'confident' AND hidden = 0) = 0
    AND (
      MAX(band = 'confident' AND hidden = 1) = 1
      OR COALESCE(MAX(CASE WHEN hidden = 1 THEN strength END), -1)
       > COALESCE(MAX(CASE WHEN hidden = 0 THEN strength END), -1)
    );
CREATE VIEW post_pending AS
  SELECT post_id FROM pairs_to_score
  UNION
  SELECT pl.post_id
  FROM post_links pl
  JOIN links l ON l.url = pl.link_url
  JOIN posts p ON p.id = pl.post_id
  WHERE (p.bookmarked = 1 OR p.liked = 1)
    AND l.status IN ('new', 'failed');
INSERT INTO meta (key, value) VALUES ('band_confident', '0.7');
INSERT INTO meta (key, value) VALUES ('band_unsure', '0.3');
INSERT INTO meta (key, value) VALUES ('schema_version', '2');
