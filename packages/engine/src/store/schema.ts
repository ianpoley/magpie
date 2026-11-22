import type { DatabaseSync } from 'node:sqlite';

import { MEMBERSHIP_VIEWS_V1, MEMBERSHIP_VIEWS_V2, MEMBERSHIP_VIEWS_V3 } from './membership.ts';

export const REREAD_HOST_TITLED_VIDEOS = `
  UPDATE links SET status = 'failed', attempts = 3, next_attempt_at = '1970-01-01T00:00:00.000Z'
  WHERE status = 'resolved' AND title = host AND attempts = 1
    AND host IN ('youtube.com', 'youtu.be', 'm.youtube.com', 'music.youtube.com');
`;

const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  ) WITHOUT ROWID;

  -- One row per saved post. A post that leaves both collections keeps its row
  -- with both flags cleared; visible means bookmarked = 1 OR liked = 1.
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

  -- The thing a link points at: a repo, a package, a video, an article.
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

  -- Other keys that map to a resource, such as a repo's declared homepage host.
  CREATE TABLE resource_aliases (
    alias_key   TEXT PRIMARY KEY,
    resource_id INTEGER NOT NULL REFERENCES resources (id) ON DELETE CASCADE,
    kind        TEXT NOT NULL,
    created_at  TEXT NOT NULL
  ) WITHOUT ROWID;
  CREATE INDEX resource_aliases_resource ON resource_aliases (resource_id);

  -- One row per distinct URL as written in a post (usually a t.co short link).
  -- status: new | resolved | not_resource | failed | unresolved
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

  -- kind: auto | system.  state: active | deleted
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

  -- kind: auto | pinned | system
  -- state: proposed (inactive, being validated) | active | split | merged
  --        | deleted (tombstone) | removed (creation undone)
  -- last_match_json: post ids that matched confidently when the topic left
  -- active, kept so a later proposal cannot grow it back under another name.
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

  -- Raw probability per post and topic definition; bands apply at read time.
  CREATE TABLE scores (
    post_id     TEXT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
    topic_id    INTEGER NOT NULL REFERENCES topics (id) ON DELETE CASCADE,
    probability REAL NOT NULL,
    scored_at   TEXT NOT NULL,
    PRIMARY KEY (post_id, topic_id)
  ) WITHOUT ROWID;
  CREATE INDEX scores_topic ON scores (topic_id);

  -- A per-post decision that outranks the score.
  -- action: add (user put the post in the topic, confident)
  --       | remove (user took it out)
  --       | unsure (a split kept the post on this subtopic so it lost no place)
  CREATE TABLE overrides (
    post_id    TEXT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
    topic_id   INTEGER NOT NULL REFERENCES topics (id) ON DELETE CASCADE,
    action     TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (post_id, topic_id)
  ) WITHOUT ROWID;
  CREATE INDEX overrides_topic ON overrides (topic_id);

  -- upstream_sync: ok | failed | unknown.  status: running | complete | failed
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

  -- The change log. snapshot_json holds what undo needs to restore.
  -- source: auto | user.  undone_by: the change that undid this one.
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

  -- Which topics a change touched, so undoing an older change can find the
  -- later ones that built on it. No foreign key on topic_id: the log outlives
  -- topic rows.
  CREATE TABLE change_topics (
    change_id INTEGER NOT NULL REFERENCES changes (id) ON DELETE CASCADE,
    topic_id  INTEGER NOT NULL,
    role      TEXT NOT NULL DEFAULT 'affected',
    PRIMARY KEY (change_id, topic_id)
  ) WITHOUT ROWID;
  CREATE INDEX change_topics_topic ON change_topics (topic_id);

  -- One row per evolution round, whether or not it changed anything.
  -- kind: new_topic | split.  outcome: applied | rejected | dropped | failed
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

  -- Unfiled posts an evolution round already looked at.
  CREATE TABLE proposal_seen_posts (
    post_id    TEXT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
    attempt_id INTEGER NOT NULL REFERENCES proposal_attempts (id) ON DELETE CASCADE,
    PRIMARY KEY (post_id, attempt_id)
  ) WITHOUT ROWID;

  -- Proposals that must not come back: undone by the user, with the confident
  -- match set they had so a renamed copy can be recognised by overlap.
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
  `,
  MEMBERSHIP_VIEWS_V1,
  MEMBERSHIP_VIEWS_V2,
  `
  ALTER TABLE areas ADD COLUMN set_by_owner INTEGER NOT NULL DEFAULT 0;
  UPDATE areas SET set_by_owner = 1
   WHERE kind = 'auto' AND state = 'active' AND (locked = 1 OR hidden != 1 - is_dev);
  INSERT INTO meta (key, value)
  SELECT 'category_focus_legacy', '1'
   WHERE EXISTS (SELECT 1 FROM areas WHERE kind = 'auto' AND state = 'active');
  `,
  MEMBERSHIP_VIEWS_V3,
  `
  ALTER TABLE run_stages ADD COLUMN reason TEXT;
  UPDATE run_stages SET reason = 'secret_store_unreadable'
  WHERE stage = 'x_auth' AND outcome = 'failed' AND message LIKE 'The X session could not be read%';
  `,
  REREAD_HOST_TITLED_VIDEOS,
  `ALTER TABLE overrides ADD COLUMN merged_from INTEGER;`,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export function readSchemaVersion(db: DatabaseSync): number {
  const hasMeta = db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'meta'`).get();
  if (!hasMeta) return 0;
  const row = db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get();
  return row ? Number(row.value) : 0;
}

export function assertKnownVersion(db: DatabaseSync): number {
  const version = readSchemaVersion(db);
  if (version > SCHEMA_VERSION) {
    throw new Error(
      `Store has schema version ${version}, newer than version ${SCHEMA_VERSION} this code knows. Update the code before opening it.`,
    );
  }
  return version;
}

export function migrate(db: DatabaseSync): void {
  if (assertKnownVersion(db) === SCHEMA_VERSION) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (let version = assertKnownVersion(db); version < SCHEMA_VERSION; version++) {
      db.exec(MIGRATIONS[version]);
    }
    db.prepare(
      `INSERT INTO meta (key, value) VALUES ('schema_version', ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    ).run(String(SCHEMA_VERSION));
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
