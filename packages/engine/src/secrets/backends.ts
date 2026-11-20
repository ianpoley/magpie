import { spawn } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { parseSecrets } from '../secrets.ts';

/**
 * Why a secret could not be read, written or deleted:
 *   locked       the OS secret store did not answer in time or refused without asking the user
 *   unavailable  the store or the fallback file cannot be used
 *   invalid      the value was refused before anything was written
 * Messages never contain a secret value.
 */
export type SecretFailure = { ok: false; reason: 'locked' | 'unavailable' | 'invalid'; message: string };

/** A stored value, or null when nothing is stored under that account. */
export type BackendRead = { ok: true; value: string | null } | SecretFailure;
export type BackendWrite = { ok: true } | SecretFailure;

/** One place secrets live. Accounts and values are checked by the caller before they get here. */
export interface SecretBackend {
  get(account: string): Promise<BackendRead>;
  set(account: string, value: string): Promise<BackendWrite>;
  delete(account: string): Promise<BackendWrite>;
}

type ToolResult =
  | { kind: 'done'; code: number; stdout: string; stderr: string }
  | { kind: 'missing' }
  | { kind: 'timeout' };

/** Runs a tool with `stdin` as its only input, killing it after `timeoutMs`. Never throws. */
function runTool(path: string, args: string[], stdin: string, timeoutMs: number): Promise<ToolResult> {
  return new Promise((resolve) => {
    const child = spawn(path, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const settle = (result: ToolResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      settle({ kind: 'timeout' });
    }, timeoutMs);
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
    child.on('error', (error: NodeJS.ErrnoException) => {
      settle(error.code === 'ENOENT' ? { kind: 'missing' } : { kind: 'done', code: -1, stdout: '', stderr: error.message });
    });
    child.on('close', (code) => settle({ kind: 'done', code: code ?? -1, stdout, stderr }));
    // A tool that exits before reading its input breaks the pipe; the close handler reports that.
    child.stdin.on('error', () => {});
    child.stdin.end(stdin);
  });
}

const stripNewline = (text: string) => (text.endsWith('\n') ? text.slice(0, -1) : text);

const locked = (tool: string, detail: string): SecretFailure => ({
  ok: false,
  reason: 'locked',
  message: `The secret store is locked or did not answer (${tool} ${detail}).`,
});
const unavailable = (tool: string, detail: string): SecretFailure => ({
  ok: false,
  reason: 'unavailable',
  message: `The secret store is unavailable (${tool} ${detail}).`,
});

// `security` exits with the low byte of the keychain status code.
const SECURITY_NOT_FOUND = 44; // errSecItemNotFound
const SECURITY_LOCKED = new Set([
  36, // errSecInteractionNotAllowed: the keychain is locked and no one can be asked
  51, // errSecAuthFailed
  128, // userCanceled
]);

/**
 * The macOS login keychain through `/usr/bin/security`. The item's access list
 * trusts the binary that created it, and Apple's `security` keeps a stable
 * signature across upgrades where `node` does not, so a background service
 * reads without a prompt. Writes go on stdin through `security -i`, so the
 * value is never in an argument list. `-A` (any app may read) is never used.
 */
export function securityBackend(options: { service: string; path: string; timeoutMs: number }): SecretBackend {
  const { service, path, timeoutMs } = options;
  const failure = (result: ToolResult): SecretFailure => {
    if (result.kind === 'timeout') return locked('security', `took over ${timeoutMs} ms`);
    if (result.kind === 'missing') return unavailable('security', `not found at ${path}`);
    return SECURITY_LOCKED.has(result.code)
      ? locked('security', `exited ${result.code}`)
      : unavailable('security', `exited ${result.code}`);
  };
  return {
    async get(account) {
      const result = await runTool(path, ['find-generic-password', '-a', account, '-s', service, '-w'], '', timeoutMs);
      if (result.kind === 'done' && result.code === 0) return { ok: true, value: stripNewline(result.stdout) };
      if (result.kind === 'done' && result.code === SECURITY_NOT_FOUND) return { ok: true, value: null };
      return failure(result);
    },
    async set(account, value) {
      // The value is single-quoted so `security -i` reads it as one argument;
      // the caller has already refused values holding a quote, backslash or newline.
      const line = `add-generic-password -U -a ${account} -s ${service} -w '${value}'\n`;
      const result = await runTool(path, ['-i'], line, timeoutMs);
      return result.kind === 'done' && result.code === 0 ? { ok: true } : failure(result);
    },
    async delete(account) {
      const result = await runTool(path, ['delete-generic-password', '-a', account, '-s', service], '', timeoutMs);
      if (result.kind === 'done' && (result.code === 0 || result.code === SECURITY_NOT_FOUND)) return { ok: true };
      // Nothing can have been stored by a tool that is not installed.
      if (result.kind === 'missing') return { ok: true };
      return failure(result);
    },
  };
}

/** The Linux Secret Service through libsecret's `secret-tool`, with the value on stdin. */
export function secretToolBackend(options: { service: string; path: string; timeoutMs: number }): SecretBackend {
  const { service, path, timeoutMs } = options;
  const attributes = (account: string) => ['service', service, 'account', account];
  const failure = (result: ToolResult): SecretFailure => {
    if (result.kind === 'timeout') return locked('secret-tool', `took over ${timeoutMs} ms`);
    if (result.kind === 'missing') return unavailable('secret-tool', `not found at ${path}`);
    return /lock|prompt|dismiss/i.test(result.stderr)
      ? locked('secret-tool', `exited ${result.code}`)
      : unavailable('secret-tool', `exited ${result.code}`);
  };
  return {
    async get(account) {
      const result = await runTool(path, ['lookup', ...attributes(account)], '', timeoutMs);
      if (result.kind === 'done' && result.code === 0) {
        const value = stripNewline(result.stdout);
        return { ok: true, value: value === '' ? null : value };
      }
      // A lookup that matches nothing exits 1 and says nothing.
      if (result.kind === 'done' && result.code === 1 && result.stderr.trim() === '') return { ok: true, value: null };
      return failure(result);
    },
    async set(account, value) {
      const result = await runTool(path, ['store', '--label', `x-corpus ${account}`, ...attributes(account)], value, timeoutMs);
      return result.kind === 'done' && result.code === 0 ? { ok: true } : failure(result);
    },
    async delete(account) {
      const result = await runTool(path, ['clear', ...attributes(account)], '', timeoutMs);
      if (result.kind === 'done' && (result.code === 0 || (result.code === 1 && result.stderr.trim() === ''))) {
        return { ok: true };
      }
      if (result.kind === 'missing') return { ok: true };
      return failure(result);
    },
  };
}

/** `x-session` is kept as `X_SESSION`, so the Jev key keeps its old name, `TYPESAFE_API_KEY`. */
const fileKey = (account: string) => account.toUpperCase().replaceAll('-', '_');

const quote = (value: string) => (value.includes("'") ? `"${value}"` : `'${value}'`);

/**
 * The warned fallback: `KEY='value'` lines in an owner-only file, the same
 * file and format the Jev key has always used. A file other users can read
 * or change is refused rather than trusted.
 */
export function fileBackend(options: { path: string }): SecretBackend {
  const { path } = options;
  const insecure = (mode: number): SecretFailure => ({
    ok: false,
    reason: 'unavailable',
    message: `${path} can be read or changed by other users (mode ${(mode & 0o777).toString(8)}). Run chmod 600 ${path} and try again.`,
  });

  const failed = (verb: string, error: unknown): SecretFailure => ({
    ok: false,
    reason: 'unavailable',
    message: `${path} could not be ${verb} (${(error as NodeJS.ErrnoException).code}).`,
  });

  /** The parsed file; empty when there is none. */
  const load = (checkMode: boolean): { ok: true; secrets: Record<string, string> } | SecretFailure => {
    let mode: number;
    try {
      mode = statSync(path).mode;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { ok: true, secrets: {} };
      return failed('read', error);
    }
    if (checkMode && (mode & 0o077) !== 0) return insecure(mode);
    try {
      return { ok: true, secrets: parseSecrets(readFileSync(path, 'utf8')) };
    } catch (error) {
      return failed('read', error);
    }
  };

  const save = (secrets: Record<string, string>): BackendWrite => {
    try {
      const entries = Object.entries(secrets);
      if (entries.length === 0) {
        unlinkSync(path);
        return { ok: true };
      }
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      const tmp = `${path}.tmp`;
      writeFileSync(tmp, entries.map(([key, value]) => `${key}=${quote(value)}\n`).join(''), { mode: 0o600 });
      chmodSync(tmp, 0o600);
      renameSync(tmp, path);
      return { ok: true };
    } catch (error) {
      return failed('written', error);
    }
  };

  return {
    async get(account) {
      const loaded = load(true);
      if (!loaded.ok) return loaded;
      return { ok: true, value: loaded.secrets[fileKey(account)] ?? null };
    },
    async set(account, value) {
      const loaded = load(true);
      if (!loaded.ok) return loaded;
      return save({ ...loaded.secrets, [fileKey(account)]: value });
    },
    async delete(account) {
      // Deleting only takes a secret away, so it goes ahead whatever the file's mode.
      const loaded = load(false);
      if (!loaded.ok) return loaded;
      if (!(fileKey(account) in loaded.secrets)) return { ok: true };
      const { [fileKey(account)]: _removed, ...rest } = loaded.secrets;
      return save(rest);
    },
  };
}
