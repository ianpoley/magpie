import { spawn } from 'node:child_process';

export const SERVICE_NAMES = ['magpie-web', 'magpie-worker'] as const;
export type ServiceName = (typeof SERVICE_NAMES)[number];

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
export type Runner = (
  command: string,
  args: string[],
  options?: { cwd?: string; showOutput?: boolean; env?: Record<string, string | undefined> },
) => Promise<CommandResult>;

export interface ServiceManager {
  unitPath(name: ServiceName): string;
  render(spec: ServiceSpec): string;
  nodePathOf(text: string): string | null;
  dataRootOf(text: string): string | null;
  stop(name: ServiceName): Promise<void>;
  start(names: readonly ServiceName[]): Promise<void>;
  remove(names: readonly ServiceName[]): Promise<void>;
  afterRemove(): Promise<void>;
  state(name: ServiceName): Promise<{ loaded: boolean; running: boolean }>;
  bootHint?(): Promise<string | null>;
}

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
      env: options.env as NodeJS.ProcessEnv | undefined,
      stdio: options.showOutput ? ['ignore', 'inherit', 'inherit'] : ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk));
    child.stderr?.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
    child.on('error', (error) => resolve({ code: -1, stdout, stderr: error.message }));
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
