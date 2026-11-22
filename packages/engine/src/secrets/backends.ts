import { spawn } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { parseSecrets } from '../secrets.ts';

export type SecretFailure = { ok: false; reason: 'locked' | 'unavailable' | 'invalid'; message: string };

export type BackendRead = { ok: true; value: string | null } | SecretFailure;
export type BackendWrite = { ok: true } | SecretFailure;

export interface SecretBackend {
  get(account: string): Promise<BackendRead>;
  set(account: string, value: string): Promise<BackendWrite>;
  delete(account: string): Promise<BackendWrite>;
}

type ToolResult =
  | { kind: 'done'; code: number; stdout: string; stderr: string }
  | { kind: 'missing' }
  | { kind: 'timeout' };

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

const SECURITY_WORD = /^[A-Za-z0-9._-]{1,128}$/;
const SECURITY_QUOTABLE = /^[^'\\\x00-\x1f\x7f]*$/;

const SECURITY_NOT_FOUND = 44;
const SECURITY_LOCKED = new Set([
  36,
  51,
  128,
]);

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
      if (!SECURITY_WORD.test(account) || !SECURITY_WORD.test(service)) {
        return { ok: false, reason: 'invalid', message: 'The keychain account and service must be letters, digits or the characters . _ -' };
      }
      if (!SECURITY_QUOTABLE.test(value)) {
        return { ok: false, reason: 'invalid', message: 'A keychain value cannot hold a quote, a backslash or a control character.' };
      }
      const line = `add-generic-password -U -a ${account} -s ${service} -w '${value}'\n`;
      const result = await runTool(path, ['-i'], line, timeoutMs);
      return result.kind === 'done' && result.code === 0 ? { ok: true } : failure(result);
    },
    async delete(account) {
      const result = await runTool(path, ['delete-generic-password', '-a', account, '-s', service], '', timeoutMs);
      if (result.kind === 'done' && (result.code === 0 || result.code === SECURITY_NOT_FOUND)) return { ok: true };
      if (result.kind === 'missing') return { ok: true };
      return failure(result);
    },
  };
}

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
      if (result.kind === 'done' && result.code === 1 && result.stderr.trim() === '') return { ok: true, value: null };
      return failure(result);
    },
    async set(account, value) {
      const result = await runTool(path, ['store', '--label', `magpie ${account}`, ...attributes(account)], value, timeoutMs);
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

const fileKey = (account: string) => account.toUpperCase().replaceAll('-', '_');

const quote = (value: string) => (value.includes("'") ? `"${value}"` : `'${value}'`);

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
      const loaded = load(false);
      if (!loaded.ok) return loaded;
      if (!(fileKey(account) in loaded.secrets)) return { ok: true };
      const { [fileKey(account)]: _removed, ...rest } = loaded.secrets;
      return save(rest);
    },
  };
}
