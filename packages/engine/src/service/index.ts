import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SCHEDULE, SECRETS, SERVICE, mainCheckout, paths, secretSettings, setting, xTools } from '../config.ts';
import { SECRET_NAMES, createSecretStore, osBackend, probe } from '../secrets/store.ts';
import type { BackendName } from '../secrets/store.ts';
import { readWorkerStatus } from '../sync/state.ts';
import type { WorkerStatus } from '../sync/state.ts';
import { errorText } from '../util.ts';
import { launchd } from './launchd.ts';
import { SERVICE_NAMES, spawnRunner } from './manager.ts';
import type { Runner, ServiceManager, ServiceName, ServiceSpec } from './manager.ts';
import { systemd } from './systemd.ts';
import { clearGeneratedTypes, idleWebBuild, liveBuildFile, readBuiltCommit, webDir } from './web-build.ts';

export { must, spawnRunner } from './manager.ts';
export { builtCommitFile, liveWebBuild } from './web-build.ts';
export type { CommandResult, Runner } from './manager.ts';

const CODE_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const nextBin = (codeRoot: string) => join(webDir(codeRoot), 'node_modules', 'next', 'dist', 'bin', 'next');

export function serviceSpecs(input: {
  nodePath: string;
  codeRoot: string;
  repoRoot: string;
  home: string;
  port: number;
}): ServiceSpec[] {
  const { nodePath, codeRoot, repoRoot, home, port } = input;
  const logs = join(repoRoot, 'logs');
  const path = [dirname(nodePath), join(home, '.local', 'bin'), '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'];
  const environment = { PATH: [...new Set(path)].join(delimiter), MAGPIE_ROOT: repoRoot };
  const service = (name: ServiceName, description: string, program: string[], workingDirectory: string): ServiceSpec => {
    const log = name.replace(/^magpie-/, '');
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
    service('magpie-web', 'magpie web app', [nextBin(codeRoot), 'start', '-H', '127.0.0.1', '-p', String(port)], webDir(codeRoot)),
    service('magpie-worker', 'magpie sync worker', [join(codeRoot, 'packages', 'engine', 'bin', 'worker.mjs')], repoRoot),
  ];
}

export function upgradeSafeNodePath(nodePath: string): string {
  const keg = /^(.+)\/Cellar\/([^/]+)\/[^/]+\/bin\/node$/.exec(nodePath);
  if (!keg) return nodePath;
  const linked = join(keg[1], 'opt', keg[2], 'bin', 'node');
  try {
    return realpathSync(linked) === realpathSync(nodePath) ? linked : nodePath;
  } catch {
    return nodePath;
  }
}

function nodeRange(): string {
  const manifest = JSON.parse(readFileSync(join(CODE_ROOT, 'package.json'), 'utf8')) as { engines?: { node?: string } };
  const range = manifest.engines?.node;
  if (!range) throw new Error('package.json declares no engines.node range.');
  return range;
}

const versionParts = (text: string) => text.replace(/^v/, '').split('.').map(Number);

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

export type SetupCheck = { name: string; level: 'ok' | 'warn' | 'fail'; detail: string };

export type SetupOptions = {
  env?: Record<string, string | undefined>;
  platform?: NodeJS.Platform;
  nodeVersion?: string;
};

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
        detail: `magpie needs Node ${range} (the pinned Birdclaw requires it); this is Node ${version}. Switch to a Node in that range (.node-version names 26) and run this again.`,
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
    checks.push({ name: 'secret store', level: 'warn', detail: `MAGPIE_SECRET_BACKEND=file is set: ${fallback}` });
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
  nodeVersion?: string;
  run?: Runner;
  log?: (line: string) => void;
  codeRoot?: string;
};

export function installBlocker(options: Pick<ServiceOptions, 'codeRoot'> = {}): string | null {
  const codeRoot = options.codeRoot ?? CODE_ROOT;
  const main = mainCheckout(codeRoot);
  if (main !== codeRoot) {
    return `This is a git worktree. Services installed from it would run this worktree's code and stop when it is removed. Run bun run setup from the main checkout, ${main}. Worktrees already share its corpus and worker.`;
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
  else throw new Error(`magpie installs background services on macOS and Linux only, not ${platform}.`);
  return {
    platform,
    env,
    home,
    run,
    manager,
    files: paths(env),
    nodePath: options.nodePath ?? upgradeSafeNodePath(process.execPath),
    nodeVersion: options.nodeVersion ?? process.version,
    log: options.log ?? (() => {}),
  };
}

export function webPort(env: Record<string, string | undefined> = process.env): number {
  const text = setting(env, 'PORT');
  if (!text) return SERVICE.defaultPort;
  const port = Number(text);
  if (!/^\d+$/.test(text) || port < 1 || port > 65535) throw new Error(`MAGPIE_PORT must be a port number from 1 to 65535, not "${text}".`);
  return port;
}

export async function installService(options: ServiceOptions = {}): Promise<void> {
  const ctx = context(options);
  const blocker = installBlocker(options);
  if (blocker) throw new Error(blocker);
  const { platform, env, home, run, manager, files, nodePath, nodeVersion, log } = ctx;
  const codeRoot = options.codeRoot ?? CODE_ROOT;
  const checks = await setupChecks({ env, platform, nodeVersion });
  for (const check of checks) log(formatCheck(check));
  const failed = checks.filter((check) => check.level === 'fail');
  if (failed.length > 0) throw new Error(`setup checks failed: ${failed.map((check) => `${check.name}: ${check.detail}`).join(' ')}`);

  const port = webPort(env);
  const specs = serviceSpecs({ nodePath, codeRoot, repoRoot: files.repoRoot, home, port });
  const target = idleWebBuild(codeRoot);
  const head = await run('git', ['-C', codeRoot, 'rev-parse', 'HEAD']);
  log(`building the web app into apps/web/${target}; the running app keeps serving until the build is done`);
  clearGeneratedTypes(codeRoot);
  const build = await run(nodePath, [nextBin(codeRoot), 'build'], {
    cwd: webDir(codeRoot),
    showOutput: true,
    env: { ...env, MAGPIE_NEXT_DIST: target },
  });
  if (build.code !== 0) {
    throw new Error(`the web app build failed (exit ${build.code}). The running app and the service files were left as they were.`);
  }
  mkdirSync(join(webDir(codeRoot), target), { recursive: true });
  if (head.code === 0) writeFileSync(join(webDir(codeRoot), target, 'magpie-commit'), `${head.stdout.trim()}\n`);
  writeFileSync(liveBuildFile(codeRoot), `${target}\n`);

  mkdirSync(files.logsDir, { recursive: true });
  for (const spec of specs) {
    const path = manager.unitPath(spec.name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, manager.render(spec), { mode: 0o644 });
    log(`wrote ${path}`);
  }
  await manager.start(SERVICE_NAMES);
  log(`both services are running; the web app is at http://127.0.0.1:${port}`);
  const bootHint = await manager.bootHint?.();
  if (bootHint) log(bootHint);
}

export async function uninstallService(options: ServiceOptions & { purgeSecrets?: boolean } = {}): Promise<void> {
  const { platform, env, manager, files, log } = context(options);
  await manager.remove(SERVICE_NAMES);
  for (const name of SERVICE_NAMES) rmSync(manager.unitPath(name), { force: true });
  await manager.afterRemove();
  log('both services are stopped and removed');
  const kept = [files.stateDir, files.dataDir, files.markdownDir, files.logsDir, files.configDir].filter((path) => existsSync(path));
  if (kept.length > 0) {
    log('your corpus, edits and settings stay where they are; delete these by hand to remove them too:');
    for (const path of kept) log(`  ${path}`);
  }
  if (!options.purgeSecrets) {
    log('the X cookies and the Jev key stay stored; add --purge-secrets to delete them');
    return;
  }

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
  worker: (Pick<WorkerStatus, 'heartbeatAt' | 'state' | 'schedule' | 'nextRunAt' | 'lastAttempt'> & { heartbeatAgeMs: number; fresh: boolean }) | null;
  secretBackend: BackendName | null;
  node: { path: string | null; exists: boolean; version: string | null; inRange: boolean | null; range: string; upgradeSafePath: string | null };
  dataRoot: string | null;
  here: string;
  appUrl: string;
  buildBehindCode: boolean;
  bootHint: string | null;
};

async function buildBehindCode(run: Runner, root: string): Promise<boolean> {
  const built = readBuiltCommit(root);
  if (built === null) return false;
  const head = await run('git', ['-C', root, 'rev-parse', 'HEAD']);
  return head.code === 0 && head.stdout.trim() !== built;
}

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
          lastAttempt: heartbeat.lastAttempt,
          heartbeatAgeMs: age,
          fresh: age <= SCHEDULE.heartbeatStaleMs,
        }
      : null;

  const range = nodeRange();
  const installed = units.find((unit) => unit.installed);
  const path = installed ? manager.nodePathOf(readFileSync(installed.file, 'utf8')) : null;
  const workerUnit = units.find((unit) => unit.name.endsWith('-worker') && unit.installed);
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
    node: {
      path,
      exists,
      version,
      inRange: version === null ? null : inRange(version, range),
      range,
      upgradeSafePath: exists && upgradeSafeNodePath(path) !== path ? upgradeSafeNodePath(path) : null,
    },
    dataRoot,
    here: files.repoRoot,
    appUrl: `http://127.0.0.1:${webPort(env)}`,
    buildBehindCode: installed !== undefined && (await buildBehindCode(run, mainCheckout(options.codeRoot ?? CODE_ROOT))),
    bootHint: installed === undefined ? null : ((await manager.bootHint?.()) ?? null),
  };
}
