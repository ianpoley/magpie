import type { DatabaseSync } from "node:sqlite";

import { expandLinks, usableTarget, withoutTracking } from "./post-links.ts";
import type { Area, Band, Change, Media, Post, QuotedPost, RemovedPost, Resource, Run, RunStage, Snapshot, Topic } from "./types.ts";

export function emptySnapshot(storeExists: boolean): Snapshot {
  return {
    storeExists,
    posts: [],
    removed: [],
    areas: [],
    topics: [],
    resources: [],
    changes: [],
    lastRun: null,
    lastCompleteRunAt: null,
  };
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);
const finite = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

function parse(json: unknown): unknown {
  if (typeof json !== "string") return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function media(value: unknown): Media[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const url = isObject(entry) ? text(entry.url) : null;
    return url === null ? [] : [{ type: text((entry as Json).type) ?? "image", url }];
  });
}

function quoted(value: unknown): QuotedPost | null {
  if (!isObject(value)) return null;
  const author = isObject(value.author) ? value.author : {};
  return {
    id: text(value.id),
    text: text(value.text) ?? "",
    createdAt: text(value.createdAt),
    authorHandle: text(author.handle),
    authorName: text(author.displayName),
    authorAvatarUrl: text(author.avatarUrl),
    authorAvatarHue: finite(author.avatarHue),
    media: media(value.media),
  };
}

function epochMs(iso: string | null): number | null {
  if (iso === null) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function counts(json: unknown): Record<string, number> {
  const value = parse(json);
  if (!isObject(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] => finite(entry[1]) !== null));
}

/** Each post's shortened addresses and where they lead, for the links that resolved. */
function linkTargets(db: DatabaseSync): Map<string, Map<string, string>> {
  const byPost = new Map<string, Map<string, string>>();
  const rows = db
    .prepare(`SELECT pl.post_id, l.url, l.final_url FROM post_links pl JOIN links l ON l.url = pl.link_url WHERE l.final_url IS NOT NULL`)
    .all();
  for (const row of rows) {
    const target = text(row.final_url);
    if (!usableTarget(target)) continue;
    const postId = String(row.post_id);
    let targets = byPost.get(postId);
    if (!targets) byPost.set(postId, (targets = new Map()));
    targets.set(String(row.url), withoutTracking(target));
  }
  return byPost;
}

const NO_TARGETS: ReadonlyMap<string, string> = new Map();

function read(db: DatabaseSync): Snapshot {
  const targets = linkTargets(db);
  const readable = (postId: string, value: unknown, quotedId: string | null = null): string =>
    expandLinks(String(value), postId, targets.get(postId) ?? NO_TARGETS, quotedId);
  const posts: Post[] = [];
  const postsById = new Map<string, Post>();
  const postRows = db
    .prepare(
      `SELECT id, text, created_at, url, author_handle, author_name, author_avatar_url, author_avatar_hue,
              like_count, quoted_json, media_json, bookmarked, liked, first_seen_at
       FROM posts
       WHERE id IN (SELECT id FROM visible_posts)
       ORDER BY created_at DESC, id`,
    )
    .all();
  for (const row of postRows) {
    const createdAt = text(row.created_at);
    const quotedPost = quoted(parse(row.quoted_json));
    const post: Post = {
      id: String(row.id),
      text: readable(String(row.id), row.text, quotedPost?.id ?? null),
      createdAt,
      createdAtMs: epochMs(createdAt),
      addedAtMs: epochMs(text(row.first_seen_at)),
      url: String(row.url),
      authorHandle: String(row.author_handle),
      authorName: String(row.author_name),
      authorAvatarUrl: text(row.author_avatar_url),
      authorAvatarHue: finite(row.author_avatar_hue),
      likeCount: Number(row.like_count),
      quoted: quotedPost,
      media: media(parse(row.media_json)),
      bookmarked: row.bookmarked === 1,
      liked: row.liked === 1,
      linkedPages: [],
      hidden: false,
      unfiled: false,
      pending: false,
      memberships: [],
    };
    posts.push(post);
    postsById.set(post.id, post);
  }

  const removed: RemovedPost[] = db
    .prepare(
      `SELECT id, text, created_at, url, author_handle, author_name, author_avatar_url, bookmarked, liked, removed_at
       FROM posts
       WHERE removed_at IS NOT NULL AND (bookmarked = 1 OR liked = 1)
       ORDER BY removed_at DESC, id`,
    )
    .all()
    .map((row) => ({
      id: String(row.id),
      text: readable(String(row.id), row.text),
      createdAt: text(row.created_at),
      url: String(row.url),
      authorHandle: String(row.author_handle),
      authorName: String(row.author_name),
      authorAvatarUrl: text(row.author_avatar_url),
      bookmarked: row.bookmarked === 1,
      liked: row.liked === 1,
      removedAt: String(row.removed_at),
    }));

  const areas: Area[] = db
    .prepare(`SELECT id, name, kind, hidden, locked FROM areas WHERE state = 'active' ORDER BY position, id`)
    .all()
    .map((row) => ({
      id: Number(row.id),
      name: String(row.name),
      kind: String(row.kind),
      hidden: row.hidden === 1,
      locked: row.locked === 1,
      postCount: 0,
    }));
  const areasById = new Map(areas.map((area) => [area.id, area]));

  const topics: Topic[] = db
    .prepare(
      `SELECT id, area_id, name, definition, kind, hidden, locked FROM topics WHERE state = 'active' ORDER BY position, id`,
    )
    .all()
    .map((row) => {
      const areaId = row.area_id === null ? null : Number(row.area_id);
      const hiddenSelf = row.hidden === 1;
      return {
        id: Number(row.id),
        areaId,
        name: String(row.name),
        definition: String(row.definition),
        kind: String(row.kind),
        hidden: hiddenSelf || (areaId !== null && areasById.get(areaId)?.hidden === true),
        hiddenSelf,
        locked: row.locked === 1,
        postCount: 0,
        confidentCount: 0,
      };
    });
  const topicsById = new Map(topics.map((topic) => [topic.id, topic]));

  // One read of the membership view answers Unfiled and hidden as well. Each
  // of the store's own views for those costs as much again as this read; a
  // test holds this derivation to them.
  const areaPosts = new Map<number, Set<string>>();
  const standing = new Map<string, { confidentVisible: boolean; confidentHidden: boolean; hidden: number; visible: number }>();
  const filed = new Set<string>();
  const membershipRows = db
    .prepare(
      `SELECT post_id, topic_id, band, strength, hidden, pinned FROM topic_membership
       ORDER BY band = 'confident' DESC, strength DESC, topic_id`,
    )
    .all();
  for (const row of membershipRows) {
    const post = postsById.get(String(row.post_id));
    const topic = topicsById.get(Number(row.topic_id));
    if (!post || !topic) continue;
    const band: Band = row.band === "confident" ? "confident" : "unsure";
    post.memberships.push({ topicId: topic.id, band });
    topic.postCount++;
    if (band === "confident") {
      topic.confidentCount++;
      filed.add(post.id);
    }
    if (topic.areaId !== null) {
      let seen = areaPosts.get(topic.areaId);
      if (!seen) areaPosts.set(topic.areaId, (seen = new Set()));
      seen.add(post.id);
    }
    if (row.pinned === 1) continue;
    let state = standing.get(post.id);
    if (!state) standing.set(post.id, (state = { confidentVisible: false, confidentHidden: false, hidden: -1, visible: -1 }));
    const strength = Number(row.strength);
    if (row.hidden === 1) {
      state.hidden = Math.max(state.hidden, strength);
      if (band === "confident") state.confidentHidden = true;
    } else {
      state.visible = Math.max(state.visible, strength);
      if (band === "confident") state.confidentVisible = true;
    }
  }
  for (const area of areas) area.postCount = areaPosts.get(area.id)?.size ?? 0;
  for (const post of posts) {
    const state = standing.get(post.id);
    post.unfiled = !filed.has(post.id);
    post.hidden = state !== undefined && !state.confidentVisible && (state.confidentHidden || state.hidden > state.visible);
  }

  for (const row of db.prepare(`SELECT post_id FROM post_pending`).all()) {
    const post = postsById.get(String(row.post_id));
    if (post) post.pending = true;
  }

  const resourcePosts = new Map<number, string[]>();
  const linkRows = db
    .prepare(
      `SELECT pl.post_id, l.title, l.final_url, l.host, l.resource_id
       FROM post_links pl JOIN links l ON l.url = pl.link_url
       WHERE l.status = 'resolved' AND (l.title IS NOT NULL OR l.resource_id IS NOT NULL)
       ORDER BY pl.post_id, pl.position`,
    )
    .all();
  for (const row of linkRows) {
    const post = postsById.get(String(row.post_id));
    if (!post) continue;
    const title = text(row.title);
    if (title !== null && !post.linkedPages.some((page) => page.title === title)) {
      const url = text(row.final_url);
      post.linkedPages.push({ title, url: usableTarget(url) ? withoutTracking(url) : null, host: text(row.host) });
    }
    if (row.resource_id !== null) {
      const resourceId = Number(row.resource_id);
      const postIds = resourcePosts.get(resourceId);
      if (!postIds) resourcePosts.set(resourceId, [post.id]);
      else if (!postIds.includes(post.id)) postIds.push(post.id);
    }
  }
  const resources: Resource[] = db
    .prepare(`SELECT id, kind, url, host, title FROM resources ORDER BY id`)
    .all()
    .flatMap((row) => {
      const postIds = resourcePosts.get(Number(row.id));
      if (!postIds) return [];
      return [{ id: Number(row.id), kind: String(row.kind), url: String(row.url), host: text(row.host), title: text(row.title), postIds }];
    });

  const changes: Change[] = db
    .prepare(`SELECT id, kind, source, summary, post_count, undoable, undone_at, created_at FROM changes ORDER BY id DESC`)
    .all()
    .map((row) => ({
      id: Number(row.id),
      kind: String(row.kind),
      source: String(row.source),
      summary: String(row.summary),
      postCount: Number(row.post_count),
      createdAt: String(row.created_at),
      undoable: row.source === "auto" && row.undoable === 1 && row.undone_at === null,
      undoneAt: text(row.undone_at),
    }));

  const runRow = db.prepare(`SELECT * FROM runs ORDER BY id DESC LIMIT 1`).get();
  let lastRun: Run | null = null;
  if (runRow) {
    const stages: RunStage[] = db
      .prepare(`SELECT stage, outcome, message, counts_json FROM run_stages WHERE run_id = ? ORDER BY id`)
      .all(Number(runRow.id))
      .map((row) => ({
        stage: String(row.stage),
        outcome: String(row.outcome),
        message: text(row.message),
        counts: counts(row.counts_json),
      }));
    lastRun = {
      id: Number(runRow.id),
      startedAt: String(runRow.started_at),
      finishedAt: text(runRow.finished_at),
      status: String(runRow.status),
      upstreamSync: String(runRow.upstream_sync),
      upstreamSyncDetail: text(runRow.upstream_sync_detail),
      message: text(runRow.message),
      stages,
    };
  }
  const complete = db.prepare(`SELECT finished_at FROM runs WHERE status = 'complete' ORDER BY id DESC LIMIT 1`).get();

  return {
    storeExists: true,
    posts,
    removed,
    areas,
    topics,
    resources,
    changes,
    lastRun,
    lastCompleteRunAt: complete ? text(complete.finished_at) : null,
  };
}

/**
 * Everything the screen shows, read in one transaction so a sync writing at
 * the same moment cannot give memberships for topics that were not loaded.
 * Which posts are in which topic comes from the store's membership view, the
 * one place that is defined.
 */
export function readSnapshot(db: DatabaseSync): Snapshot {
  if (db.isTransaction) return read(db);
  db.exec("BEGIN");
  try {
    return read(db);
  } finally {
    db.exec("COMMIT");
  }
}
