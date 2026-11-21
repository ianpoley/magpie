import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MIGRATION, SCHEDULE, SECRETS, SERVICE, mainCheckout, paths, secretSettings, xTools } from '../config.ts';
import { SECRET_NAMES, createSecretStore, osBackend, probe } from '../secrets/store.ts';
import type { BackendName } from '../secrets/store.ts';
import { readWorkerStatus } from '../sync/state.ts';
import type { WorkerStatus } from '../sync/state.ts';
import { errorText } from '../util.ts';
import { launchd } from './launchd.ts';
import { SERVICE_NAMES, spawnRunner } from './manager.ts';
import type { Runner, ServiceManager, ServiceName, ServiceSpec } from './manager.ts';
import { systemd } from './systemd.ts';

export { must, spawnRunner } from './manager.ts';
export type { CommandResult, Runner } from './manager.ts';

// The code's own clone, which holds the web app and the worker. The data
// root (X_CORPUS_ROOT) is the same directory unless that variable moves it.
const CODE_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const webDir = (codeRoot: string) => join(codeRoot, 'apps', 'web');
// The workspace link, not the resolved file: bun's store path changes with every reinstall.
const nextBin = (codeRoot: string) => join(webDir(codeRoot), 'node_modules', 'next', 'dist', 'bin', 'next');

/**
 * The web and worker services for a clone. The PATH starts with the captured
 * node's directory, so anything the services spawn with `node` gets the same
 * one, and includes ~/.local/bin, where the Claude CLI lives.
 */
export function serviceSpecs(input: {
  nodePath: string;
  codeRoot: string;
  /** Where data, state and logs live. */
  repoRoot: string;
  home: string;
  port: number;
}): ServiceSpec[] {
  const { nodePath, codeRoot, repoRoot, home, port } = input;
  const logs = join(repoRoot, 'logs');
  const path = [dirname(nodePath), join(home, '.local', 'bin'), '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'];
  const environment = { PATH: [...new Set(path)].join(delimiter), X_CORPUS_ROOT: repoRoot };
  const service = (name: ServiceName, description: string, program: string[], workingDirectory: string): ServiceSpec => {
    const log = name.replace(/^x-corpus-/, '');
    return {
      name,
      description,
      program: [nodePath, ...program],
      workingDirectory,
      environment,
      stdoutPath: join(logs, `${log}.out.log`),
      stderrPath: join(logs, `${log}.err.log`),
    };
  };
  return [
    service('x-corpus-web', 'x-corpus web app', [nextBin(codeRoot), 'start', '-H', '127.0.0.1', '-p', String(port)], webDir(codeRoot)),
    service('x-corpus-worker', 'x-corpus sync worker', [join(codeRoot, 'packages', 'engine', 'bin', 'worker.mjs')], repoRoot),
  ];
}

/** The `engines.node` range from the repo's package.json, such as `>=25.8.1 <27`. */
function nodeRange(): string {
  const manifest = JSON.parse(readFileSync(join(CODE_ROOT, 'package.json'), 'utf8')) as { engines?: { node?: string } };
  const range = manifest.engines?.node;
  if (!range) throw new Error('package.json declares no engines.node range.');
  return range;
}

const versionParts = (text: string) => text.replace(/^v/, '').split('.').map(Number);

/** Whether a Node version such as `v26.5.0` is inside a space-separated range of comparators such as `>=25.8.1 <27`. */
export function inRange(version: string, range: string): boolean {
  const have = versionParts(version);
  const compare = (want: number[]) => {
    for (let i = 0; i < 3; i++) {
      const diff = (have[i] ?? 0) - (want[i] ?? 0);
      if (diff !== 0) return Math.sign(diff);
    }
    return 0;
  };
  return range
    .trim()
    .split(/\s+/)
    .every((comparator) => {
      const match = /^(>=|<=|>|<|=)?(\d+(?:\.\d+){0,2})$/.exec(comparator);
      if (!match) throw new Error(`The Node range "${range}" uses syntax this check does not read.`);
      const order = compare(versionParts(match[2]));
      switch (match[1]) {
        case '>=':
          return order >= 0;
        case '<=':
          return order <= 0;
        case '>':
          return order > 0;
        case '<':
          return order < 0;
        default:
          return order === 0;
      }
    });
}

/** `fail` stops an install; `warn` is a supported but degraded setup. */
export type SetupCheck = { name: string; level: 'ok' | 'warn' | 'fail'; detail: string };

export type SetupOptions = {
  env?: Record<string, string | undefined>;
  platform?: NodeJS.Platform;
  nodeVersion?: string;
};

/**
 * Checks what x-corpus needs: a Node in the declared range, the pinned
 * Birdclaw and bird, the Claude CLI (optional) and a usable OS secret store.
 * The secret store is tried under a throwaway keychain service, so no
 * x-corpus secret is touched and no backend is recorded. A wrong Node stops
 * the checks there.
 */
export async function setupChecks(options: SetupOptions = {}): Promise<SetupCheck[]> {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const version = options.nodeVersion ?? process.version;
  const range = nodeRange();
  if (!inRange(version, range)) {
    return [
      {
        name: 'node',
        level: 'fail',
        detail: `x-corpus needs Node ${range} (the pinned Birdclaw requires it); this is Node ${version}. Switch to a Node in that range (.node-version names 26) and run this again.`,
      },
    ];
  }
  const checks: SetupCheck[] = [{ name: 'node', level: 'ok', detail: `Node ${version} is within ${range}` }];

  let tools: ReturnType<typeof xTools> | null = null;
  let toolsError = '';
  try {
    tools = xTools(env);
  } catch (error) {
    toolsError = errorText(error);
  }
  for (const name of ['birdclaw', 'bird'] as const) {
    const tool = tools?.[name];
    if (!tool) {
      checks.push({ name, level: 'fail', detail: `the pinned ${name} could not be found (${toolsError}). Run bun install.` });
    } else if (!existsSync(tool.path)) {
      checks.push({ name, level: 'fail', detail: `not found at ${tool.path}` });
    } else {
      checks.push({ name, level: 'ok', detail: `${tool.pinned ? 'pinned' : 'override'} at ${tool.path}` });
    }
  }

  const files = paths(env);
  checks.push(
    existsSync(files.claudeCli)
      ? { name: 'claude', level: 'ok', detail: `Claude CLI at ${files.claudeCli}` }
      : {
          name: 'claude',
          level: 'warn',
          detail: `no Claude CLI at ${files.claudeCli}: syncs still run, but categories are not created or updated until it is installed and logged in`,
        },
  );

  const fallback = `secrets will be kept in ${files.secrets} (owner-only), with a warning in the app`;
  const recorded = createSecretStore({ env, platform }).backend();
  const recordedNote = recorded ? `; secrets are recorded as kept in the ${recorded === 'keychain' ? 'OS secret store' : 'file'}` : '';
  if (secretSettings(env).forceFileBackend) {
    checks.push({ name: 'secret store', level: 'warn', detail: `X_CORPUS_SECRET_BACKEND=file is set: ${fallback}` });
  } else {
    const backend = osBackend(platform, SERVICE.probeKeychainService, { timeoutMs: SECRETS.timeoutMs });
    const tried = backend ? await probe(backend) : null;
    const store = platform === 'darwin' ? 'macOS keychain' : 'Secret Service';
    if (tried === null) {
      checks.push({ name: 'secret store', level: 'warn', detail: `no OS secret store on ${platform}: ${fallback}${recordedNote}` });
    } else if (tried.ok) {
      checks.push({ name: 'secret store', level: 'ok', detail: `the ${store} can store, read and delete a test value${recordedNote}` });
    } else {
      checks.push({ name: 'secret store', level: 'warn', detail: `the ${store} failed a test: ${tried.message} Unless that is fixed, ${fallback}${recordedNote}` });
    }
  }
  return checks;
}

export const formatCheck = (check: SetupCheck) => `${check.level.padEnd(4)}  ${check.name.padEnd(12)}  ${check.detail}`;

export type ServiceOptions = {
  platform?: NodeJS.Platform;
  env?: Record<string, string | undefined>;
  home?: string;
  uid?: number;
  nodePath?: string;
  /** That node's version; this process's by default. */
  nodeVersion?: string;
  run?: Runner;
  log?: (line: string) => void;
  /** The checkout whose code the services run; this one by default. */
  codeRoot?: string;
  /** Set by `migrate`, which installs while the old job is still on disk and removes it after a good sync. */
  migrating?: boolean;
};

/**
 * The old nightly job's plist when `migrate` can move it: on macOS, with the
 * plist and its cookie file both present. Without the cookie file migrate has
 * nothing to move and refuses, so nobody is sent there. Null otherwise.
 */
export function legacyInstall(options: Pick<ServiceOptions, 'platform' | 'home'> = {}): string | null {
  const platform = options.platform ?? process.platform;
  const home = options.home ?? homedir();
  const plist = join(home, 'Library', 'LaunchAgents', `${MIGRATION.legacyLabel}.plist`);
  return platform === 'darwin' && existsSync(plist) && existsSync(join(home, '.birdclaw', 'bird.env')) ? plist : null;
}

/**
 * Why installing the services from here would be wrong, or null when it is
 * fine. `setup` prints it as the next step and `service:install` refuses with it.
 */
export function installBlocker(options: Pick<ServiceOptions, 'platform' | 'home' | 'codeRoot' | 'migrating'> = {}): string | null {
  const platform = options.platform ?? process.platform;
  const home = options.home ?? homedir();
  const codeRoot = options.codeRoot ?? CODE_ROOT;
  const main = mainCheckout(codeRoot);
  if (main !== codeRoot) {
    return `This is a git worktree. Services installed from it would run this worktree's code and stop when it is removed. Run bun run service:install from the main checkout, ${main}. Worktrees already share its corpus and worker.`;
  }
  const legacyPlist = legacyInstall({ platform, home });
  if (legacyPlist && !options.migrating) {
    return `The old ${MIGRATION.legacyLabel} job is still installed (${legacyPlist}). Run bun run migrate instead: it moves that job's X cookies and Jev key into the secret store, installs the services, and removes the old job after one good sync.`;
  }
  return null;
}

function context(options: ServiceOptions) {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const home = options.home ?? homedir();
  const run = options.run ?? spawnRunner;
  let manager: ServiceManager;
  if (platform === 'darwin') manager = launchd({ home, uid: options.uid ?? process.getuid?.() ?? 0, run });
  else if (platform === 'linux') manager = systemd({ home, env, run });
  else throw new Error(`x-corpus installs background services on macOS and Linux only, not ${platform}.`);
  return {
    platform,
    env,
    home,
    run,
    manager,
    files: paths(env),
    nodePath: options.nodePath ?? process.execPath,
    nodeVersion: options.nodeVersion ?? process.version,
    log: options.log ?? (() => {}),
  };
}

/** The web service's port: 3030 unless X_CORPUS_PORT says otherwise. */
export function webPort(env: Record<string, string | undefined> = process.env): number {
  const text = env.X_CORPUS_PORT;
  if (!text) return SERVICE.defaultPort;
  const port = Number(text);
  if (!/^\d+$/.test(text) || port < 1 || port > 65535) throw new Error(`X_CORPUS_PORT must be a port number from 1 to 65535, not "${text}".`);
  return port;
}

/**
 * Installs both services, or updates them: runs the setup checks, stops the
 * web service, builds the web app, writes both unit files, then loads and
 * (re)starts both. A failed build leaves the unit files as they were.
 */
export async function installService(options: ServiceOptions = {}): Promise<void> {
  const { platform, env, home, run, manager, files, nodePath, nodeVersion, log } = context(options);
  const blocker = installBlocker({ ...options, platform, home });
  if (blocker) throw new Error(blocker);
  const codeRoot = options.codeRoot ?? CODE_ROOT;
  const checks = await setupChecks({ env, platform, nodeVersion });
  for (const check of checks) log(formatCheck(check));
  const failed = checks.filter((check) => check.level === 'fail');
  if (failed.length > 0) throw new Error(`setup checks failed: ${failed.map((check) => `${check.name}: ${check.detail}`).join(' ')}`);

  const port = webPort(env);
  const specs = serviceSpecs({ nodePath, codeRoot, repoRoot: files.repoRoot, home, port });
  log('stopping the web service');
  await manager.stop('x-corpus-web');
  log('building the web app');
  const build = await run(nodePath, [nextBin(codeRoot), 'build'], { cwd: webDir(codeRoot), showOutput: true });
  if (build.code !== 0) {
    throw new Error(
      `the web app build failed (exit ${build.code}). The service files were left as they were, and the web service stays stopped until an install succeeds.`,
    );
  }

  mkdirSync(files.logsDir, { recursive: true });
  for (const spec of specs) {
    const path = manager.unitPath(spec.name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, manager.render(spec), { mode: 0o644 });
    log(`wrote ${path}`);
  }
  await manager.start(SERVICE_NAMES);
  log(`both services are running; the web app is at http://127.0.0.1:${port}`);
}

/**
 * Stops and removes both services. Secrets and data stay unless
 * `purgeSecrets` is set; then the X cookies and the Jev key are deleted from
 * the OS store and the file, and the record of which backend holds them and
 * the X connection are removed, so the next connection starts fresh.
 */
export async function uninstallService(options: ServiceOptions & { purgeSecrets?: boolean } = {}): Promise<void> {
  const { platform, env, manager, files, log } = context(options);
  await manager.remove(SERVICE_NAMES);
  for (const name of SERVICE_NAMES) rmSync(manager.unitPath(name), { force: true });
  await manager.afterRemove();
  log('both services are stopped and removed');
  if (!options.purgeSecrets) return;

  const store = createSecretStore({ env, platform });
  for (const name of SECRET_NAMES) {
    const deleted = await store.delete(name);
    if (!deleted.ok) throw new Error(`${name} could not be deleted: ${deleted.message}`);
  }
  rmSync(files.secretBackend, { force: true });
  rmSync(files.xConnection, { force: true });
  log('the X cookies and the Jev key are deleted, and X is disconnected');
}

export type ServiceStatus = {
  units: { name: ServiceName; file: string; installed: boolean; loaded: boolean; running: boolean }[];
  /** Null when the worker has never written a heartbeat here. */
  worker: (Pick<WorkerStatus, 'heartbeatAt' | 'state' | 'schedule' | 'nextRunAt'> & { heartbeatAgeMs: number; fresh: boolean }) | null;
  secretBackend: BackendName | null;
  /** The node the installed services run. `version` and `inRange` are null when it cannot be run. */
  node: { path: string | null; exists: boolean; version: string | null; inRange: boolean | null; range: string };
  /** The data root the installed worker runs against; null when it is not installed. */
  dataRoot: string | null;
  /** The data root this checkout uses. */
  here: string;
};

export async function serviceStatus(options: ServiceOptions = {}): Promise<ServiceStatus> {
  const { platform, env, run, manager, files } = context(options);
  const units = [];
  for (const name of SERVICE_NAMES) {
    const file = manager.unitPath(name);
    units.push({ name, file, installed: existsSync(file), ...(await manager.state(name)) });
  }

  const heartbeat = readWorkerStatus(files.workerStatus);
  const age = heartbeat ? Date.now() - Date.parse(heartbeat.heartbeatAt) : NaN;
  const worker =
    heartbeat && Number.isFinite(age)
      ? {
          heartbeatAt: heartbeat.heartbeatAt,
          state: heartbeat.state,
          schedule: heartbeat.schedule,
          nextRunAt: heartbeat.nextRunAt,
          heartbeatAgeMs: age,
          fresh: age <= SCHEDULE.heartbeatStaleMs,
        }
      : null;

  const range = nodeRange();
  const installed = units.find((unit) => unit.installed);
  const path = installed ? manager.nodePathOf(readFileSync(installed.file, 'utf8')) : null;
  const workerUnit = units.find((unit) => unit.name === 'x-corpus-worker' && unit.installed);
  const dataRoot = workerUnit ? manager.dataRootOf(readFileSync(workerUnit.file, 'utf8')) : null;
  const exists = path !== null && existsSync(path);
  let version: string | null = null;
  if (exists) {
    const ran = await run(path, ['--version']);
    version = ran.code === 0 ? ran.stdout.trim() : null;
  }
  return {
    units,
    worker,
    secretBackend: createSecretStore({ env, platform }).backend(),
    node: { path, exists, version, inRange: version === null ? null : inRange(version, range), range },
    dataRoot,
    here: files.repoRoot,
  };
}
