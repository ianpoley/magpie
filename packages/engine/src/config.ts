import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BANDS = {
  confident: 0.7,
  unsure: 0.3,
} as const;

export const EVOLUTION = {
  newTopicTrigger: 25,
  newTopicMinConfident: 8,
  regrowFactor: 1.25,
  tooBroadMinPosts: 120,
  tooBroadCorpusFraction: 0.08,
  splitMinSubtopics: 2,
  splitMinConfidentPerSubtopic: 15,
  splitMinCoverage: 0.8,
  tombstoneOverlap: 0.5,
} as const;

export const DISCOVERY = {
  batchSize: 300,
  minAreas: 6,
  maxAreas: 9,
  minTopics: 30,
  maxTopics: 50,
  postCharLimit: 400,
  nameMaxChars: 60,
  definitionMaxChars: 300,
} as const;

export const LINKS = {
  timeoutMs: 8_000,
  concurrency: 8,
  maxAttempts: 4,
  htmlCapBytes: 256 * 1024,
  maxRedirects: 10,
  retryBaseGapMs: 6 * 60 * 60 * 1000,
  notResourceHosts: ['x.com', 'twitter.com', 'twimg.com'] as readonly string[],
  shortenerHosts: ['t.co'] as readonly string[],
  sharedHosts: ['github.io', 'vercel.com', 'medium.com', 'substack.com', 'youtube.com', 'npmjs.com'] as readonly string[],
} as const;

export const ASK = {
  chunkSize: 40,
  concurrency: 6,
  contentCharLimit: 1_500,
} as const;

export const TAGGING = {
  concurrency: 6,
  maxConsecutiveFailures: 10,
} as const;

export const CLAUDE = {
  timeoutMs: 10 * 60 * 1000,
} as const;

export const SECRETS = {
  timeoutMs: 10_000,
  defaultKeychainService: 'magpie',
} as const;

export const X_SYNC = {
  preflightTimeoutMs: 2 * 60 * 1000,
  incrementalTimeoutMs: 30 * 60 * 1000,
  backfillTimeoutMs: 6 * 60 * 60 * 1000,
  exportTimeoutMs: 10 * 60 * 1000,
  limit: 100_000,
  maxPages: 50,
  backfillRetryMs: 24 * 60 * 60 * 1000,
} as const;

export const SCHEDULE = {
  defaultIntervalHours: 3,
  tickMs: 30_000,
  backoffMs: [60_000, 5 * 60_000, 15 * 60_000] as readonly number[],
  requestTtlMs: 10 * 60_000,
  heartbeatStaleMs: 2 * 60_000,
} as const;

export const SERVICE = {
  defaultPort: 3030,
  probeKeychainService: 'magpie-setup-probe',
} as const;

export const INGEST = {
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
  lock: string;
  schedulerState: string;
  workerStatus: string;
  syncRequest: string;
  configDir: string;
  secrets: string;
  settings: string;
  secretBackend: string;
  xConnection: string;
  categoryFocus: string;
  claudeCli: string;
  birdclawHome: string;
};

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

export const codeRoot = () => fileURLToPath(new URL('../../..', import.meta.url));

export function inheritedStore(store: string, env: Record<string, string | undefined> = process.env, code = codeRoot()): string | null {
  if (setting(env, 'ROOT') || setting(env, 'STORE')) return null;
  const main = mainCheckout(code);
  if (main === code) return null;
  return resolve(store) === join(main, 'state', 'corpus.sqlite') ? main : null;
}

export function setting(env: Record<string, string | undefined>, name: string): string | undefined {
  return env[`MAGPIE_${name}`] || undefined;
}

/**
 * Where things live on disk. Read when called, not at import, so a test can
 * set the overrides first:
 *   MAGPIE_ROOT        repo root (default: this checkout, or the main checkout
 *                      when this is a linked git worktree, so every worktree
 *                      shares one corpus, store and worker)
 *   MAGPIE_DATA_DIR    export directory (default: <root>/data)
 *   MAGPIE_STORE       store file (default: <root>/state/corpus.sqlite)
 *   MAGPIE_CONFIG_DIR  per-user config and secrets file (default: ~/.config/magpie)
 *   BIRDCLAW_HOME      Birdclaw's own home (default: ~/.birdclaw)
 */
export function paths(env: Record<string, string | undefined> = process.env): Paths {
  const repoRoot = resolve(setting(env, 'ROOT') || mainCheckout(codeRoot()));
  const dataDir = resolve(setting(env, 'DATA_DIR') || join(repoRoot, 'data'));
  const store = resolve(setting(env, 'STORE') || join(repoRoot, 'state', 'corpus.sqlite'));
  const stateDir = resolve(store, '..');
  const configDir = resolve(setting(env, 'CONFIG_DIR') || join(homedir(), '.config', 'magpie'));
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
    categoryFocus: join(configDir, 'category-focus.json'),
    claudeCli: resolve(setting(env, 'CLAUDE_BIN') || join(homedir(), '.local', 'bin', 'claude')),
    birdclawHome: resolve(env.BIRDCLAW_HOME || join(homedir(), '.birdclaw')),
  };
}

export type XTool = { path: string; pinned: boolean };

const requireFromEngine = createRequire(import.meta.url);

function pinnedBin(pkg: string, bin: string): XTool {
  const manifest = requireFromEngine.resolve(`${pkg}/package.json`);
  const bins = (JSON.parse(readFileSync(manifest, 'utf8')) as { bin?: Record<string, string> }).bin ?? {};
  if (!bins[bin]) throw new Error(`${pkg} declares no "${bin}" command.`);
  return { path: join(dirname(manifest), bins[bin]), pinned: true };
}

export function xTools(env: Record<string, string | undefined> = process.env): { bird: XTool; birdclaw: XTool } {
  return {
    bird: setting(env, 'BIRD_BIN') ? { path: setting(env, 'BIRD_BIN')!, pinned: false } : pinnedBin('@steipete/bird', 'bird'),
    birdclaw: setting(env, 'BIRDCLAW_BIN') ? { path: setting(env, 'BIRDCLAW_BIN')!, pinned: false } : pinnedBin('birdclaw', 'birdclaw'),
  };
}

export type SecretSettings = {
  keychainService: string;
  forceFileBackend: boolean;
};

export function secretSettings(env: Record<string, string | undefined> = process.env): SecretSettings {
  return {
    keychainService:
      setting(env, 'KEYCHAIN_SERVICE') || SECRETS.defaultKeychainService,
    forceFileBackend: setting(env, 'SECRET_BACKEND') === 'file',
  };
}
