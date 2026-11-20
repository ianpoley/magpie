import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Every threshold and limit the engine, web app and skill share. */

/** Jev probability bands, applied when membership is read, not when scored. */
export const BANDS = {
  confident: 0.7,
  unsure: 0.3,
} as const;

export const EVOLUTION = {
  /** Unfiled posts not seen by an earlier round before a new topic is proposed. */
  newTopicTrigger: 25,
  /** Unfiled posts that must match a proposed topic confidently to create it. */
  newTopicMinConfident: 8,
  /** After a round that created nothing, Unfiled must reach this multiple of its size at that round. */
  regrowFactor: 1.25,
  /** A topic is too broad above max(tooBroadMinPosts, tooBroadCorpusFraction × visible posts). */
  tooBroadMinPosts: 120,
  tooBroadCorpusFraction: 0.08,
  splitMinSubtopics: 2,
  splitMinConfidentPerSubtopic: 15,
  /** Share of the parent's confident posts the subtopics must cover together. */
  splitMinCoverage: 0.8,
  /** A proposal overlapping a tombstone's or suppressed proposal's match set by more than this is rejected. */
  tombstoneOverlap: 0.5,
} as const;

export const DISCOVERY = {
  batchSize: 300,
  minAreas: 6,
  maxAreas: 9,
  minTopics: 30,
  maxTopics: 50,
  /** Characters of each post sent to Claude. */
  postCharLimit: 400,
  /** Caps applied to names and definitions before they are stored. */
  nameMaxChars: 60,
  definitionMaxChars: 300,
} as const;

export const LINKS = {
  timeoutMs: 8_000,
  concurrency: 8,
  maxAttempts: 4,
  htmlCapBytes: 256 * 1024,
  maxRedirects: 10,
  /** Gap before retry n is retryBaseGapMs × 2^(n-1), so 6 h, 12 h, 24 h. */
  retryBaseGapMs: 6 * 60 * 60 * 1000,
  /** Links ending on these hosts are posts, not resources, and are not fetched. */
  notResourceHosts: ['x.com', 'twitter.com', 'twimg.com'] as readonly string[],
  /** Hosts that only pass a link on, so an address on one is never where a link ends. */
  shortenerHosts: ['t.co'] as readonly string[],
  /** Hosts that serve many unrelated projects, so never aliased to one repo. */
  sharedHosts: ['github.io', 'vercel.com', 'medium.com', 'substack.com', 'youtube.com', 'npmjs.com'] as readonly string[],
} as const;

export const ASK = {
  /** Questions (one per post) per Jev request. */
  chunkSize: 40,
  /** Requests in flight. */
  concurrency: 6,
  /** Characters of post content per question; the tagger uses the same limit. */
  contentCharLimit: 1_500,
} as const;

export const TAGGING = {
  /** Jev requests in flight. */
  concurrency: 6,
  /** Posts failing in a row, at any point in a pass, before it tries one post from the far end of the queue: if that one is scored the pass goes on, and if it fails too the pass stops. */
  maxConsecutiveFailures: 10,
} as const;

export const CLAUDE = {
  /** How long one headless Claude call may run. */
  timeoutMs: 10 * 60 * 1000,
} as const;

export const SECRETS = {
  /** How long one call to the OS secret tool may run before it counts as locked. */
  timeoutMs: 10_000,
  /** The keychain service (macOS) or `service` attribute (Linux) every secret is stored under. */
  defaultKeychainService: 'x-corpus',
} as const;

export const INGEST = {
  /** A collection whose export shrank by more than this share clears no flags. */
  shrinkGuard: 0.05,
} as const;

export const STORE_BUSY_TIMEOUT_MS = 5_000;

export type Paths = {
  repoRoot: string;
  dataDir: string;
  bookmarksExport: string;
  likesExport: string;
  syncStatus: string;
  stateDir: string;
  store: string;
  lock: string;
  configDir: string;
  /** The file fallback for secrets, and the legacy home of the Jev key. */
  secrets: string;
  settings: string;
  /** Which secret backend the first write chose. Not secret. */
  secretBackend: string;
  /** The X handle and connection generation. Not secret. */
  xConnection: string;
  claudeCli: string;
};

/**
 * Where things live on disk. Read when called, not at import, so a test can
 * set the overrides first:
 *   X_CORPUS_ROOT     repo root (default: derived from this file's location)
 *   X_CORPUS_DATA_DIR export directory (default: <root>/data)
 *   X_CORPUS_STORE    store file (default: <root>/state/corpus.sqlite)
 *   X_CORPUS_CONFIG_DIR per-user config and secrets file (default: ~/.config/x-corpus)
 */
export function paths(env: Record<string, string | undefined> = process.env): Paths {
  const repoRoot = resolve(env.X_CORPUS_ROOT || fileURLToPath(new URL('../../..', import.meta.url)));
  const dataDir = resolve(env.X_CORPUS_DATA_DIR || join(repoRoot, 'data'));
  const store = resolve(env.X_CORPUS_STORE || join(repoRoot, 'state', 'corpus.sqlite'));
  const stateDir = resolve(store, '..');
  const configDir = resolve(env.X_CORPUS_CONFIG_DIR || join(homedir(), '.config', 'x-corpus'));
  return {
    repoRoot,
    dataDir,
    bookmarksExport: join(dataDir, 'bookmarks.json'),
    likesExport: join(dataDir, 'likes.json'),
    syncStatus: join(dataDir, 'sync-status.json'),
    stateDir,
    store,
    lock: join(stateDir, 'categorize.lock'),
    configDir,
    secrets: join(configDir, 'secrets.env'),
    settings: join(configDir, 'settings.env'),
    secretBackend: join(configDir, 'secret-backend.json'),
    xConnection: join(configDir, 'x-connection.json'),
    claudeCli: join(homedir(), '.local', 'bin', 'claude'),
  };
}

export type SecretSettings = {
  /** Set by X_CORPUS_KEYCHAIN_SERVICE, so a check can use a throwaway service name. */
  keychainService: string;
  /** X_CORPUS_SECRET_BACKEND=file, for tests only: the OS secret store is never touched. */
  forceFileBackend: boolean;
};

export function secretSettings(env: Record<string, string | undefined> = process.env): SecretSettings {
  return {
    keychainService: env.X_CORPUS_KEYCHAIN_SERVICE || SECRETS.defaultKeychainService,
    forceFileBackend: env.X_CORPUS_SECRET_BACKEND === 'file',
  };
}
