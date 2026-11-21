import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
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

export const X_SYNC = {
  /** How long the whoami check, or the one-page bookmark probe after it, may run. */
  preflightTimeoutMs: 2 * 60 * 1000,
  /** How long an incremental sync of one collection may run. */
  incrementalTimeoutMs: 30 * 60 * 1000,
  /** How long the first, full-history sync of one collection may run. */
  backfillTimeoutMs: 6 * 60 * 60 * 1000,
  /** How long exporting one collection from the Birdclaw database may run. */
  exportTimeoutMs: 10 * 60 * 1000,
  /** Results per sync and export call: effectively all of them. */
  limit: 100_000,
  /** Page cap for an incremental sync. */
  maxPages: 50,
  /** After a failed full-history sync of a collection, the next try waits this long; incremental syncs run meanwhile. */
  backfillRetryMs: 24 * 60 * 60 * 1000,
} as const;

export const SCHEDULE = {
  /** Hours between scheduled syncs unless SYNC_INTERVAL_HOURS in the settings file says otherwise. */
  defaultIntervalHours: 3,
  /** How often the worker wakes to write its heartbeat and decide whether to run. */
  tickMs: 30_000,
  /** Waits before the retries after the first, second and third failed attempt in a row; later ones wait the normal interval. */
  backoffMs: [60_000, 5 * 60_000, 15 * 60_000] as readonly number[],
  /** A sync request older than this is dropped unrun, counted from when it was made or the last run it waited behind ended. */
  requestTtlMs: 10 * 60_000,
  /** A worker heartbeat older than this means no worker is running. */
  heartbeatStaleMs: 2 * 60_000,
} as const;

export const SERVICE = {
  /** The web service's port unless X_CORPUS_PORT says otherwise; clear of `next dev` on 3000. */
  defaultPort: 3030,
  /** The keychain service the setup check writes, reads and deletes a random value under. Never holds a real secret. */
  probeKeychainService: 'x-corpus-setup-probe',
} as const;

export const MIGRATION = {
  /** The label of the LaunchAgent that ran the old nightly script. */
  legacyLabel: 'com.ianpoley.birdclaw-nightly',
  /** How long moving an existing install waits for the new worker's first sync to finish. */
  waitTimeoutMs: 15 * 60_000,
  /** How often it checks for that sync while waiting. */
  pollMs: 5_000,
} as const;

export const INGEST = {
  /** A collection whose export shrank by more than this share clears no flags. */
  shrinkGuard: 0.05,
} as const;

export const STORE_BUSY_TIMEOUT_MS = 5_000;

export type Paths = {
  repoRoot: string;
  dataDir: string;
  markdownDir: string;
  logsDir: string;
  bookmarksExport: string;
  likesExport: string;
  syncStatus: string;
  stateDir: string;
  store: string;
  /** Held for the whole of a sync or categorize run; its live owner means a run is in progress. */
  lock: string;
  /** The scheduler's own state, including which collections have had their full-history sync. Not secret. */
  schedulerState: string;
  /** The worker's heartbeat and what it is doing, written every tick. Not secret. */
  workerStatus: string;
  /** Present while a sync is requested and not yet started. */
  syncRequest: string;
  configDir: string;
  /** The file fallback for secrets, and the legacy home of the Jev key. */
  secrets: string;
  settings: string;
  /** Which secret backend the first write chose. Not secret. */
  secretBackend: string;
  /** The X handle and connection generation. Not secret. */
  xConnection: string;
  claudeCli: string;
  /** Birdclaw's database and cache. Kept at Birdclaw's own default so an existing install carries over. */
  birdclawHome: string;
};

/**
 * The main checkout when `dir` is a linked git worktree, else `dir` itself.
 * A linked worktree's `.git` is a file pointing at `<main>/.git/worktrees/<name>`,
 * whose `commondir` leads back to `<main>/.git`. A submodule's `.git` file has
 * no `commondir` and a bare repository's common dir is not named `.git`, so
 * both stay where they are.
 */
export function mainCheckout(dir: string): string {
  try {
    const dotGit = join(dir, '.git');
    if (!statSync(dotGit).isFile()) return dir;
    const gitdir = /^gitdir:\s*(.+)$/m.exec(readFileSync(dotGit, 'utf8'))?.[1]?.trim();
    if (!gitdir) return dir;
    const worktreeGitDir = resolve(dir, gitdir);
    const common = resolve(worktreeGitDir, readFileSync(join(worktreeGitDir, 'commondir'), 'utf8').trim());
    return basename(common) === '.git' ? dirname(common) : dir;
  } catch {
    return dir;
  }
}

/** This code's own checkout: the directory holding apps/ and packages/. */
export const codeRoot = () => fileURLToPath(new URL('../../..', import.meta.url));

/**
 * The main checkout whose store this linked worktree borrows at `store`, or
 * null when the store is this checkout's own or was chosen by an override.
 */
export function inheritedStore(store: string, env: Record<string, string | undefined> = process.env, code = codeRoot()): string | null {
  if (env.X_CORPUS_ROOT || env.X_CORPUS_STORE) return null;
  const main = mainCheckout(code);
  if (main === code) return null;
  return resolve(store) === join(main, 'state', 'corpus.sqlite') ? main : null;
}

/**
 * Where things live on disk. Read when called, not at import, so a test can
 * set the overrides first:
 *   X_CORPUS_ROOT     repo root (default: this checkout, or the main checkout
 *                     when this is a linked git worktree, so every worktree
 *                     shares one corpus, store and worker)
 *   X_CORPUS_DATA_DIR export directory (default: <root>/data)
 *   X_CORPUS_STORE    store file (default: <root>/state/corpus.sqlite)
 *   X_CORPUS_CONFIG_DIR per-user config and secrets file (default: ~/.config/x-corpus)
 *   BIRDCLAW_HOME     Birdclaw's own home (default: ~/.birdclaw)
 */
export function paths(env: Record<string, string | undefined> = process.env): Paths {
  const repoRoot = resolve(env.X_CORPUS_ROOT || mainCheckout(codeRoot()));
  const dataDir = resolve(env.X_CORPUS_DATA_DIR || join(repoRoot, 'data'));
  const store = resolve(env.X_CORPUS_STORE || join(repoRoot, 'state', 'corpus.sqlite'));
  const stateDir = resolve(store, '..');
  const configDir = resolve(env.X_CORPUS_CONFIG_DIR || join(homedir(), '.config', 'x-corpus'));
  return {
    repoRoot,
    dataDir,
    markdownDir: join(repoRoot, 'markdown'),
    logsDir: join(repoRoot, 'logs'),
    bookmarksExport: join(dataDir, 'bookmarks.json'),
    likesExport: join(dataDir, 'likes.json'),
    syncStatus: join(dataDir, 'sync-status.json'),
    stateDir,
    store,
    lock: join(stateDir, 'run.lock'),
    schedulerState: join(stateDir, 'scheduler.json'),
    workerStatus: join(stateDir, 'worker.json'),
    syncRequest: join(stateDir, 'sync-request'),
    configDir,
    secrets: join(configDir, 'secrets.env'),
    settings: join(configDir, 'settings.env'),
    secretBackend: join(configDir, 'secret-backend.json'),
    xConnection: join(configDir, 'x-connection.json'),
    claudeCli: join(homedir(), '.local', 'bin', 'claude'),
    birdclawHome: resolve(env.BIRDCLAW_HOME || join(homedir(), '.birdclaw')),
  };
}

/**
 * A command-line tool: `pinned` is the entry file of the repo's own pinned
 * package, run with this process's node; otherwise `path` is an executable.
 */
export type XTool = { path: string; pinned: boolean };

const requireFromEngine = createRequire(import.meta.url);

function pinnedBin(pkg: string, bin: string): XTool {
  const manifest = requireFromEngine.resolve(`${pkg}/package.json`);
  const bins = (JSON.parse(readFileSync(manifest, 'utf8')) as { bin?: Record<string, string> }).bin ?? {};
  if (!bins[bin]) throw new Error(`${pkg} declares no "${bin}" command.`);
  return { path: join(dirname(manifest), bins[bin]), pinned: true };
}

/**
 * The bird and Birdclaw commands. Each defaults to the pinned engine
 * dependency; X_CORPUS_BIRD_BIN and X_CORPUS_BIRDCLAW_BIN replace them with
 * another executable, such as a test stub.
 */
export function xTools(env: Record<string, string | undefined> = process.env): { bird: XTool; birdclaw: XTool } {
  return {
    bird: env.X_CORPUS_BIRD_BIN ? { path: env.X_CORPUS_BIRD_BIN, pinned: false } : pinnedBin('@steipete/bird', 'bird'),
    birdclaw: env.X_CORPUS_BIRDCLAW_BIN
      ? { path: env.X_CORPUS_BIRDCLAW_BIN, pinned: false }
      : pinnedBin('birdclaw', 'birdclaw'),
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
