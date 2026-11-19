import { readFileSync } from 'node:fs';

import { INGEST } from './config.ts';
import { transaction } from './store/db.ts';
import type { Store } from './store/db.ts';
import { isRecord } from './util.ts';

type Json = Record<string, unknown>;

type PostRow = {
  id: string;
  text: string;
  created_at: string | null;
  url: string;
  author_id: string | null;
  author_handle: string;
  author_name: string;
  author_avatar_url: string | null;
  author_avatar_hue: number | null;
  like_count: number;
  reply_to_id: string | null;
  quoted_json: string | null;
  media_json: string;
  entities_json: string;
  bookmarked: number;
  liked: number;
};

type ParsedPost = Omit<PostRow, 'bookmarked' | 'liked'> & {
  links: { url: string; expandedUrl: string | null }[];
};

export type CollectionResult = {
  /** Posts with an id found in the export file. */
  inExport: number;
  /** Stored posts whose flag was cleared because they left the collection. */
  cleared: number;
  /** True when the export shrank past the guard, so no flag was cleared. */
  skippedShrink: boolean;
};

export type IngestResult = {
  posts: { total: number; visible: number; inserted: number; updated: number };
  bookmarks: CollectionResult;
  likes: CollectionResult;
  links: { added: number };
  /** Export records dropped because they carried no id. */
  withoutId: number;
};

const POST_COLUMNS = [
  'id',
  'text',
  'created_at',
  'url',
  'author_id',
  'author_handle',
  'author_name',
  'author_avatar_url',
  'author_avatar_hue',
  'like_count',
  'reply_to_id',
  'quoted_json',
  'media_json',
  'entities_json',
  'bookmarked',
  'liked',
] as const;

function pick(source: unknown, keys: string[]): unknown {
  if (!isRecord(source)) return undefined;
  for (const key of keys) {
    const value = source[key];
    if (value != null && value !== '') return value;
  }
  return undefined;
}

const text = (value: unknown): string | null => (value == null ? null : String(value));

const ID_KEYS = ['id', 'id_str', 'rest_id', 'tweet_id'];
const TEXT_KEYS = ['full_text', 'text', 'content', 'tweet'];

// X escapes only these three characters in post text. `&amp;` goes last so `&amp;lt;` stays `&lt;`.
const decodeEntities = (value: string): string =>
  value.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');

function decodeQuoted(quoted: Record<string, unknown>): Record<string, unknown> {
  const decoded = { ...quoted };
  for (const key of TEXT_KEYS) {
    if (typeof decoded[key] === 'string') decoded[key] = decodeEntities(decoded[key]);
  }
  return decoded;
}
const HANDLE_KEYS = ['handle', 'screen_name', 'username'];
const NAME_KEYS = ['displayName', 'name', 'display_name'];

const looksLikePost = (value: unknown): boolean =>
  isRecord(value) && pick(value, [...TEXT_KEYS, ...ID_KEYS]) !== undefined;

/** The largest array of post-like records anywhere in the export envelope. */
function findPostArray(node: unknown): unknown[] | null {
  if (Array.isArray(node) && (node.length === 0 || node.some(looksLikePost))) return node;
  if (typeof node !== 'object' || node === null) return null;
  let best: unknown[] | null = null;
  for (const value of Object.values(node)) {
    const found = findPostArray(value);
    if (found && (!best || found.length > best.length)) best = found;
  }
  return best;
}

function parsePost(record: unknown): ParsedPost | null {
  const id = text(pick(record, ID_KEYS));
  if (!isRecord(record) || id === null) return null;
  const author = [record.author, record.user, record.core, record.account].find(isRecord) ?? {};
  const handle = String(pick(record, HANDLE_KEYS) ?? pick(author, HANDLE_KEYS) ?? 'unknown');
  const hue = Number(pick(author, ['avatarHue']));
  const likes = Number(pick(record, ['likeCount', 'like_count', 'favorite_count']));
  const entities = isRecord(record.entities) ? record.entities : {};
  const urls = Array.isArray(entities.urls) ? entities.urls : [];
  const quoted = record.quotedTweet ?? record.quoted_tweet;

  const links: ParsedPost['links'] = [];
  for (const entry of urls) {
    const url = text(pick(entry, ['url', 'expandedUrl', 'expanded_url']));
    if (url === null || links.some((link) => link.url === url)) continue;
    links.push({ url, expandedUrl: text(pick(entry, ['expandedUrl', 'expanded_url'])) });
  }

  return {
    id,
    text: decodeEntities(String(pick(record, TEXT_KEYS) ?? '')),
    created_at: text(pick(record, ['createdAt', 'created_at', 'date', 'timestamp'])),
    url: String(
      pick(record, ['url', 'permalink']) ??
        (handle === 'unknown' ? `https://x.com/i/status/${id}` : `https://x.com/${handle}/status/${id}`),
    ),
    author_id: text(pick(author, ID_KEYS)),
    author_handle: handle,
    author_name: String(pick(record, NAME_KEYS) ?? pick(author, NAME_KEYS) ?? handle),
    author_avatar_url: text(pick(author, ['avatarUrl', 'avatar_url', 'profile_image_url'])),
    author_avatar_hue: Number.isFinite(hue) ? hue : null,
    like_count: Number.isFinite(likes) ? likes : 0,
    reply_to_id: text(pick(record, ['replyToId', 'reply_to_id', 'in_reply_to_status_id_str'])),
    quoted_json: isRecord(quoted) ? JSON.stringify(decodeQuoted(quoted)) : null,
    media_json: JSON.stringify(Array.isArray(record.media) ? record.media : []),
    entities_json: JSON.stringify(entities),
    links,
  };
}

function readExport(path: string): { posts: ParsedPost[]; withoutId: number } {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read export ${path}: ${(error as Error).message}`, { cause: error });
  }
  const records = findPostArray(raw);
  if (!records) throw new Error(`No post array found in export ${path}`);
  const posts = records.map(parsePost).filter((post) => post !== null);
  return { posts, withoutId: records.length - posts.length };
}

/**
 * Loads the bookmarks and likes exports into the store as one row per post.
 *
 * A post's flags follow which export files it appears in. A post in neither
 * file keeps its row with the flags cleared, unless that collection's export
 * shrank past the guard, in which case its flag is left as stored.
 *
 * Both files are read and checked before the store is touched, and every write
 * happens in one transaction: an unreadable or malformed file throws and
 * leaves the store as it was.
 */
export function ingest(db: Store, files: { bookmarksPath: string; likesPath: string }): IngestResult {
  const bookmarks = readExport(files.bookmarksPath);
  const likes = readExport(files.likesPath);

  const incoming = new Map<string, ParsedPost>();
  for (const post of [...likes.posts, ...bookmarks.posts]) incoming.set(post.id, post);
  const bookmarkIds = new Set(bookmarks.posts.map((post) => post.id));
  const likeIds = new Set(likes.posts.map((post) => post.id));

  return transaction(db, () => {
    const stored = new Map<string, PostRow>();
    for (const row of db.prepare(`SELECT ${POST_COLUMNS.join(', ')} FROM posts`).all()) {
      stored.set(String(row.id), row as unknown as PostRow);
    }

    const shrankPastGuard = (flag: 'bookmarked' | 'liked', exported: number): boolean => {
      let before = 0;
      for (const row of stored.values()) before += row[flag];
      return before > 0 && (before - exported) / before > INGEST.shrinkGuard;
    };
    const result: IngestResult = {
      posts: { total: 0, visible: 0, inserted: 0, updated: 0 },
      bookmarks: {
        inExport: bookmarkIds.size,
        cleared: 0,
        skippedShrink: shrankPastGuard('bookmarked', bookmarkIds.size),
      },
      likes: { inExport: likeIds.size, cleared: 0, skippedShrink: shrankPastGuard('liked', likeIds.size) },
      links: { added: 0 },
      withoutId: bookmarks.withoutId + likes.withoutId,
    };

    const flagFor = (collection: CollectionResult, inExport: boolean, before: number | undefined): number => {
      if (inExport) return 1;
      if (!before) return 0;
      if (collection.skippedShrink) return 1;
      collection.cleared += 1;
      return 0;
    };

    const now = new Date().toISOString();
    const insertPost = db.prepare(
      `INSERT INTO posts (${POST_COLUMNS.join(', ')}, first_seen_at)
       VALUES (${POST_COLUMNS.map(() => '?').join(', ')}, ?)`,
    );
    const updatePost = db.prepare(
      `UPDATE posts SET ${POST_COLUMNS.slice(1)
        .map((column) => `${column} = ?`)
        .join(', ')} WHERE id = ?`,
    );
    const insertLink = db.prepare(
      `INSERT OR IGNORE INTO links (url, expanded_url, first_seen_at) VALUES (?, ?, ?)`,
    );
    const insertPostLink = db.prepare(
      `INSERT OR IGNORE INTO post_links (post_id, link_url, position) VALUES (?, ?, ?)`,
    );
    const clearFlags = db.prepare(`UPDATE posts SET bookmarked = ?, liked = ? WHERE id = ?`);

    for (const post of incoming.values()) {
      const before = stored.get(post.id);
      const { links, ...fields } = post;
      const row: PostRow = {
        ...fields,
        bookmarked: flagFor(result.bookmarks, bookmarkIds.has(post.id), before?.bookmarked),
        liked: flagFor(result.likes, likeIds.has(post.id), before?.liked),
      };
      const values = POST_COLUMNS.map((column) => row[column]);
      if (!before) {
        insertPost.run(...values, now);
        result.posts.inserted += 1;
      } else if (POST_COLUMNS.some((column) => before[column] !== row[column])) {
        updatePost.run(...values.slice(1), row.id);
        result.posts.updated += 1;
      }
      links.forEach((link, position) => {
        result.links.added += Number(insertLink.run(link.url, link.expandedUrl, now).changes);
        insertPostLink.run(post.id, link.url, position);
      });
    }

    for (const before of stored.values()) {
      if (incoming.has(before.id) || (!before.bookmarked && !before.liked)) continue;
      const bookmarked = flagFor(result.bookmarks, false, before.bookmarked);
      const liked = flagFor(result.likes, false, before.liked);
      if (bookmarked !== before.bookmarked || liked !== before.liked) {
        clearFlags.run(bookmarked, liked, before.id);
      }
    }

    const counts = db
      .prepare(`SELECT (SELECT count(*) FROM posts) AS total, (SELECT count(*) FROM visible_posts) AS visible`)
      .get();
    result.posts.total = Number(counts?.total);
    result.posts.visible = Number(counts?.visible);
    return result;
  });
}
