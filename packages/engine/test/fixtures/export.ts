import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type ExportPost = Record<string, unknown> & { id: string };

type PostOptions = {
  text?: string;
  handle?: string;
  createdAt?: string;
  likeCount?: number;
  urls?: { url: string; expandedUrl?: string }[];
  media?: { url: string; type: string }[];
  quoted?: ExportPost | null;
};

export function exportPost(id: string, options: PostOptions = {}): ExportPost {
  const handle = options.handle ?? `author${id}`;
  return {
    id,
    accountId: 'acct_1',
    accountHandle: 'owner',
    kind: 'home',
    text: options.text ?? `post ${id} text`,
    createdAt: options.createdAt ?? '2026-01-01T00:00:00.000Z',
    replyToId: null,
    isReplied: false,
    likeCount: options.likeCount ?? 0,
    mediaCount: options.media?.length ?? 0,
    bookmarked: false,
    liked: false,
    author: {
      id: `u_${handle}`,
      handle,
      displayName: `Name of ${handle}`,
      bio: '',
      followersCount: 10,
      followingCount: 5,
      avatarHue: 120,
      avatarUrl: `https://img.example/${handle}.jpg`,
      createdAt: '2020-01-01T00:00:00.000Z',
    },
    entities: {
      urls: (options.urls ?? []).map((u, i) => ({
        url: u.url,
        expandedUrl: u.expandedUrl ?? u.url,
        displayUrl: u.url.replace(/^https?:\/\//, ''),
        start: i * 30,
        end: i * 30 + 23,
      })),
    },
    media: options.media ?? [],
    replyToTweet: null,
    quotedTweet: options.quoted ?? null,
    retweetedTweet: null,
  };
}

export function tempDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'x-corpus-test-'));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export function writeExports(
  dir: string,
  collections: { bookmarks: unknown; likes: unknown },
): { bookmarksPath: string; likesPath: string } {
  const bookmarksPath = join(dir, 'bookmarks.json');
  const likesPath = join(dir, 'likes.json');
  writeFileSync(bookmarksPath, JSON.stringify(collections.bookmarks));
  writeFileSync(likesPath, JSON.stringify(collections.likes));
  return { bookmarksPath, likesPath };
}
