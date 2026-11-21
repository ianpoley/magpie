import { spawn } from 'node:child_process';

/**
 * The two user-level background services: the web app and the sync worker.
 * Each runs the node that installed it directly, with no shell in between.
 * On macOS they are LaunchAgents and on Linux systemd user units; both use
 * these names as their label or unit name.
 */
export const SERVICE_NAMES = ['magpie-web', 'magpie-worker'] as const;
export type ServiceName = (typeof SERVICE_NAMES)[number];
/** The same two services as installed before the rename, while Magpie was called x-corpus. */
export const LEGACY_SERVICE_NAMES = ['x-corpus-web', 'x-corpus-worker'] as const;
/** A service under its current or its old name: anything that stops, starts or reads an installed unit takes either. */
export type UnitName = ServiceName | (typeof LEGACY_SERVICE_NAMES)[number];

export type ServiceSpec = {
  name: ServiceName;
  description: string;
  program: string[];
  workingDirectory: string;
  environment: Record<string, string>;
  stdoutPath: string;
  stderrPath: string;
};

export type CommandResult = { code: number; stdout: string; stderr: string };
/** Runs a command. `showOutput` passes its output through to the user instead of capturing it. */
export type Runner = (command: string, args: string[], options?: { cwd?: string; showOutput?: boolean }) => Promise<CommandResult>;

/** What launchd or systemd must do for each step of an install, uninstall or status. */
export interface ServiceManager {
  unitPath(name: UnitName): string;
  render(spec: ServiceSpec): string;
  /** The node an installed unit runs, read back from its file. */
  nodePathOf(text: string): string | null;
  /** The data root (MAGPIE_ROOT) an installed unit runs against, read back from its file. */
  dataRootOf(text: string): string | null;
  stop(name: UnitName): Promise<void>;
  /** Once the unit files are written: loads them and starts or restarts every one. */
  start(names: readonly UnitName[]): Promise<void>;
  /** Stops and unloads the services, before their files are removed. */
  remove(names: readonly UnitName[]): Promise<void>;
  afterRemove(): Promise<void>;
  state(name: UnitName): Promise<{ loaded: boolean; running: boolean }>;
}

/** Runs a command and throws, with its stderr, when it exits nonzero. */
export async function must(run: Runner, command: string, args: string[]): Promise<CommandResult> {
  const result = await run(command, args);
  if (result.code !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim();
    throw new Error(`${[command, ...args].join(' ')} exited ${result.code}${detail ? `: ${detail}` : ''}`);
  }
  return result;
}

export const spawnRunner: Runner = (command, args, options = {}) =>
  new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: options.showOutput ? ['ignore', 'inherit', 'inherit'] : ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk));
    child.stderr?.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
    child.on('error', (error) => resolve({ code: -1, stdout, stderr: error.message }));
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
