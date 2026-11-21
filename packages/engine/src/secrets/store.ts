import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

import { SECRETS, paths, secretSettings } from '../config.ts';
import { readSecrets } from '../secrets.ts';
import { fileBackend, secretToolBackend, securityBackend } from './backends.ts';
import type { SecretBackend, SecretFailure } from './backends.ts';

export type { SecretFailure } from './backends.ts';

/** The X cookie pair, kept as one item so a reader never sees half of a reconnect. */
export type XSession = { authToken: string; ct0: string };

export type Secrets = { 'x-session': XSession; 'typesafe-api-key': string };
export type SecretName = keyof Secrets;
export const SECRET_NAMES = ['x-session', 'typesafe-api-key'] as const satisfies readonly SecretName[];

/** `keychain` is the OS secret store: the macOS keychain or the Linux Secret Service. */
export type BackendName = 'keychain' | 'file';

/** `value` is null when the secret is not set. */
export type SecretRead<T> = { ok: true; value: T | null } | SecretFailure;
export type SecretWrite = { ok: true; backend: BackendName } | SecretFailure;
export type SecretDelete = { ok: true } | SecretFailure;

export interface SecretStore {
  backend(): BackendName | null;
  get<N extends SecretName>(name: N): Promise<SecretRead<Secrets[N]>>;
  set<N extends SecretName>(name: N, value: Secrets[N]): Promise<SecretWrite>;
  delete(name: SecretName): Promise<SecretDelete>;
}

export type SecretStoreOptions = {
  env?: Record<string, string | undefined>;
  platform?: NodeJS.Platform;
  /** Defaults to Apple's `/usr/bin/security`, the binary the keychain items trust. */
  securityPath?: string;
  secretToolPath?: string;
  timeoutMs?: number;
};

// Cookie values are URL-safe tokens. Anything else, in particular a quote,
// backslash, space or newline, could break out of the `security -i` line.
const COOKIE = /^[A-Za-z0-9%._-]{1,512}$/;
const SERVICE_NAME = /^[A-Za-z0-9._-]{1,128}$/;
// Printable ASCII without quotes or backslashes, for the same reason.
const API_KEY = /^[\x21\x23-\x26\x28-\x5b\x5d-\x7e]{1,512}$/;

const invalid = (message: string): SecretFailure => ({ ok: false, reason: 'invalid', message });

const isSession = (value: unknown): value is XSession =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as XSession).authToken === 'string' &&
  typeof (value as XSession).ct0 === 'string' &&
  COOKIE.test((value as XSession).authToken) &&
  COOKIE.test((value as XSession).ct0);

function encode(name: SecretName, value: unknown): { ok: true; text: string } | SecretFailure {
  if (name === 'x-session') {
    if (!isSession(value)) {
      return invalid('The X cookies must each be 1 to 512 letters, digits or the characters % . _ -');
    }
    return { ok: true, text: JSON.stringify({ authToken: value.authToken, ct0: value.ct0 }) };
  }
  if (typeof value !== 'string' || !API_KEY.test(value)) {
    return invalid('The API key must be 1 to 512 printable characters with no spaces, quotes or backslashes.');
  }
  return { ok: true, text: value };
}

function decode<N extends SecretName>(name: N, text: string): SecretRead<Secrets[N]> {
  if (name === 'typesafe-api-key') return { ok: true, value: text as Secrets[N] };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    value = null;
  }
  if (!isSession(value)) {
    return { ok: false, reason: 'unavailable', message: 'The stored X session is not in the expected shape.' };
  }
  return { ok: true, value: { authToken: value.authToken, ct0: value.ct0 } as Secrets[N] };
}

function readRecord(path: string): BackendName | null {
  try {
    const backend = (JSON.parse(readFileSync(path, 'utf8')) as { backend?: unknown }).backend;
    return backend === 'keychain' || backend === 'file' ? backend : null;
  } catch {
    return null;
  }
}

function writeRecord(dir: string, path: string, backend: BackendName): { ok: true } | SecretFailure {
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(`${path}.tmp`, `${JSON.stringify({ backend, chosenAt: new Date().toISOString() })}\n`);
    renameSync(`${path}.tmp`, path);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: 'unavailable',
      message: `${path} could not be written (${(error as NodeJS.ErrnoException).code}).`,
    };
  }
}

/** Write, read back and delete a random value: the OS store is usable only if all three work. */
export async function probe(backend: SecretBackend): Promise<{ ok: true } | SecretFailure> {
  const value = randomBytes(16).toString('hex');
  const written = await backend.set('probe', value);
  const read = written.ok ? await backend.get('probe') : null;
  const deleted = await backend.delete('probe');
  if (!written.ok) return written;
  if (read !== null && !read.ok) return read;
  if (read === null || read.value !== value) {
    return { ok: false, reason: 'unavailable', message: 'The secret store did not return the value just written.' };
  }
  return deleted;
}

/** The OS secret store on `platform`, under the keychain service `service`, or null when the platform has none. */
export function osBackend(
  platform: NodeJS.Platform,
  service: string,
  options: Pick<SecretStoreOptions, 'securityPath' | 'secretToolPath'> & { timeoutMs: number },
): SecretBackend | null {
  const common = { service, timeoutMs: options.timeoutMs };
  if (platform === 'darwin') return securityBackend({ ...common, path: options.securityPath ?? '/usr/bin/security' });
  if (platform === 'linux') return secretToolBackend({ ...common, path: options.secretToolPath ?? 'secret-tool' });
  return null;
}

/**
 * The magpie secrets. The first write picks the backend, the OS secret
 * store when a probe of it works and the owner-only file otherwise, and
 * records the choice. Every later read and write uses only the recorded
 * backend, so a locked store is reported, never silently swapped for the file.
 *
 * Before anything is recorded, the Jev key is read as it always was: from
 * TYPESAFE_API_KEY in the environment, then from the secrets file.
 */
export function createSecretStore(options: SecretStoreOptions = {}): SecretStore {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const timeoutMs = options.timeoutMs ?? SECRETS.timeoutMs;
  const { configDir, secrets, secretBackend } = paths(env);
  const { keychainService, forceFileBackend } = secretSettings(env);
  const file = fileBackend({ path: secrets });

  const keychain = (): SecretBackend | null | SecretFailure => {
    if (!SERVICE_NAME.test(keychainService)) {
      return invalid('MAGPIE_KEYCHAIN_SERVICE must be 1 to 128 letters, digits or the characters . _ -');
    }
    return osBackend(platform, keychainService, { ...options, timeoutMs });
  };

  const recorded = (): BackendName | null => {
    const backend = readRecord(secretBackend);
    return backend && forceFileBackend ? 'file' : backend;
  };

  const active = (backend: BackendName): SecretBackend | SecretFailure => {
    if (backend === 'file') return file;
    const os = keychain();
    return os ?? { ok: false, reason: 'unavailable', message: `There is no OS secret store on ${platform}.` };
  };

  const legacyRead = <N extends SecretName>(name: N): SecretRead<Secrets[N]> => {
    if (name !== 'typesafe-api-key') return { ok: true, value: null };
    try {
      const key = env.TYPESAFE_API_KEY || readSecrets(secrets).TYPESAFE_API_KEY || null;
      return { ok: true, value: key as Secrets[N] | null };
    } catch (error) {
      return {
        ok: false,
        reason: 'unavailable',
        message: `${secrets} could not be read (${(error as NodeJS.ErrnoException).code}).`,
      };
    }
  };

  return {
    backend: recorded,

    async get(name) {
      const backend = recorded();
      if (backend === null) return legacyRead(name);
      const target = active(backend);
      if ('ok' in target) return target;
      const read = await target.get(name);
      if (!read.ok) return read;
      return read.value === null ? { ok: true, value: null } : decode(name, read.value);
    },

    async set(name, value) {
      const encoded = encode(name, value);
      if (!encoded.ok) return encoded;
      let backend = recorded();
      if (backend === null) {
        let os: SecretBackend | null | SecretFailure = null;
        if (!forceFileBackend) {
          os = keychain();
          if (os !== null && 'ok' in os) return os;
        }
        backend = os !== null && (await probe(os)).ok ? 'keychain' : 'file';
        const saved = writeRecord(configDir, secretBackend, backend);
        if (!saved.ok) return saved;
      }
      const target = active(backend);
      if ('ok' in target) return target;
      const written = await target.set(name, encoded.text);
      return written.ok ? { ok: true, backend } : written;
    },

    async delete(name) {
      const fromFile = await file.delete(name);
      if (!fromFile.ok) return fromFile;
      if (forceFileBackend) return { ok: true };
      const os = keychain();
      if (os !== null && 'ok' in os) return os;
      if (os === null) return { ok: true };
      // Clearing the OS store is required only where secrets live there; on a
      // file-fallback machine it is a courtesy that may fail.
      const fromOs = await os.delete(name);
      return fromOs.ok || recorded() !== 'keychain' ? { ok: true } : fromOs;
    },
  };
}
