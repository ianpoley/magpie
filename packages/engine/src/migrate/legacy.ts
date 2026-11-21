import { readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { MIGRATION, SECRETS, paths, secretSettings } from '../config.ts';
import { fileBackend } from '../secrets/backends.ts';
import { SECRET_NAMES, createSecretStore, osBackend, probe } from '../secrets/store.ts';
import type { SecretName, SecretStoreOptions, Secrets, XSession } from '../secrets/store.ts';
import { parseSecrets } from '../secrets.ts';
import { installService, must, spawnRunner, uninstallService } from '../service/index.ts';
import type { Runner } from '../service/index.ts';
import { openStore } from '../store/db.ts';
import { recordBackfill } from '../sync/backfill.ts';
import { X_COLLECTION_STAGES } from '../sync/run.ts';
import { readWorkerStatus, removeSyncRequest, writeConnection, writeSyncRequest } from '../sync/state.ts';
import { errorText } from '../util.ts';
import { createBirdclaw } from '../x/birdclaw.ts';
import type { XAdapter } from '../x/birdclaw.ts';

/**
 * Moves an install that syncs through the old nightly LaunchAgent, with its
 * cookies in ~/.birdclaw/bird.env and its Jev key in
 * ~/.config/x-corpus/secrets.env, onto the OS secret store and the two
 * background services. The new setup has to finish one good sync before
 * anything of the old one is deleted, and any failure puts the old one back.
 */


/** The secrets.env keys the secret store can hold, and the names it keeps them under. */
const SECRETS_ENV_KEYS: Record<string, SecretName> = { TYPESAFE_API_KEY: 'typesafe-api-key' };

export type MigrateOptions = {
  env?: Record<string, string | undefined>;
  platform?: NodeJS.Platform;
  home?: string;
  uid?: number;
  run?: Runner;
  x?: Pick<XAdapter, 'whoami'>;
  secretStore?: Pick<SecretStoreOptions, 'securityPath' | 'secretToolPath' | 'timeoutMs'>;
  installServices?: () => Promise<void>;
  uninstallServices?: () => Promise<void>;
  /** The old job's LaunchAgent label; its plist is `~/Library/LaunchAgents/<label>.plist`. */
  legacyLabel?: string;
  timeoutMs?: number;
  pollMs?: number;
  log?: (line: string) => void;
};

/** `state` says, one line each, what the machine was left with. */
export type MigrateResult = { ok: true; handle: string | null } | { ok: false; message: string; state: string[] };

/** Why the migration cannot go on; the message never holds a secret value. */
class Stop extends Error {}

function readIfPresent(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Stop(`${path} could not be read (${(error as NodeJS.ErrnoException).code}).`);
  }
}

type Wait = { ok: true } | { ok: false; message: string };

/**
 * Whether the run `runId` completed with both collections synced. Null while
 * the store cannot be read yet.
 */
function checkRun(store: string, runId: number): Wait | null {
  let db;
  try {
    db = openStore(store, { readOnly: true });
  } catch {
    return null;
  }
  try {
    const run = db.prepare('SELECT status FROM runs WHERE id = ?').get(runId) as { status: string } | undefined;
    if (run === undefined) return { ok: false, message: `run ${runId} is not in the store.` };
    const rows = db.prepare('SELECT stage, outcome, message FROM run_stages WHERE run_id = ?').all(runId) as {
      stage: string;
      outcome: string;
      message: string | null;
    }[];
    const problems: string[] = [];
    if (run.status !== 'complete') problems.push(`run ${runId} is ${run.status}`);
    for (const stage of X_COLLECTION_STAGES) {
      const row = rows.find((candidate) => candidate.stage === stage);
      if (row?.outcome !== 'ok') problems.push(`${stage} ${row ? `${row.outcome}${row.message ? ` (${row.message})` : ''}` : 'did not run'}`);
    }
    return problems.length === 0 ? { ok: true } : { ok: false, message: `the first sync under the new service failed: ${problems.join('; ')}.` };
  } finally {
    db.close();
  }
}

export async function migrate(options: MigrateOptions = {}): Promise<MigrateResult> {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const home = options.home ?? homedir();
  const uid = options.uid ?? process.getuid?.() ?? 0;
  const run = options.run ?? spawnRunner;
  const log = options.log ?? (() => {});
  const label = options.legacyLabel ?? MIGRATION.legacyLabel;
  const timeoutMs = options.timeoutMs ?? MIGRATION.waitTimeoutMs;
  const pollMs = options.pollMs ?? MIGRATION.pollMs;
  const install = options.installServices ?? (() => installService({ platform, env, home, uid, run, log, migrating: true }));
  const uninstall = options.uninstallServices ?? (() => uninstallService({ platform, env, home, uid, run, log }));
  const files = paths(env);
  const birdEnv = join(home, '.birdclaw', 'bird.env');
  const plist = join(home, 'Library', 'LaunchAgents', `${label}.plist`);
  const job = `gui/${uid}/${label}`;

  const unchanged = (message: string): MigrateResult => {
    log(`stopped: ${message}`);
    log('nothing was changed: the old job and its files are as they were');
    return { ok: false, message, state: ['Nothing was changed: the old job and its files are as they were.'] };
  };

  let session: XSession;
  const imports: { name: SecretName; value: string }[] = [];
  try {
    if (platform !== 'darwin') throw new Stop(`the old job is a macOS LaunchAgent; there is nothing to migrate on ${platform}.`);
    const birdText = readIfPresent(birdEnv);
    if (birdText === null) throw new Stop(`${birdEnv} does not exist, so there are no cookies to move.`);
    const cookies = parseSecrets(birdText);
    if (!cookies.AUTH_TOKEN || !cookies.CT0) throw new Stop(`${birdEnv} does not set both AUTH_TOKEN and CT0.`);
    session = { authToken: cookies.AUTH_TOKEN, ct0: cookies.CT0 };

    const secrets = parseSecrets(readIfPresent(files.secrets) ?? '');
    const unknown = Object.keys(secrets).filter((key) => !(key in SECRETS_ENV_KEYS));
    if (unknown.length > 0) {
      throw new Stop(`${files.secrets} sets ${unknown.join(', ')}, which the secret store cannot hold; the file would be deleted with them in it.`);
    }
    for (const [key, name] of Object.entries(SECRETS_ENV_KEYS)) if (secrets[key]) imports.push({ name, value: secrets[key] });
    log(`read the X cookies from ${birdEnv}${imports.length > 0 ? ` and ${imports.map((item) => item.name).join(', ')} from ${files.secrets}` : ''}`);
  } catch (error) {
    if (error instanceof Stop) return unchanged(error.message);
    throw error;
  }

  log('checking the cookies with X');
  const who = await (options.x ?? createBirdclaw({ env })).whoami(session);
  if (!who.ok) {
    const why = who.reason === 'rejected' ? 'X rejected the cookies' : who.reason === 'transient' ? 'X could not be reached' : 'the cookies are incomplete';
    return unchanged(`${why} (${who.message}).`);
  }
  log(`X accepted the cookies${who.handle ? ` for @${who.handle}` : ''}`);

  // The OS secret store must work: moving onto the file fallback would only swap one plaintext file for another.
  const { keychainService, forceFileBackend } = secretSettings(env);
  const secretOptions = { ...options.secretStore, timeoutMs: options.secretStore?.timeoutMs ?? SECRETS.timeoutMs };
  const store = createSecretStore({ env, platform, ...secretOptions });
  const keychain = forceFileBackend || store.backend() === 'file' ? null : osBackend(platform, keychainService, secretOptions);
  const probed = keychain ? await probe(keychain) : null;
  if (keychain === null || probed === null || !probed.ok) {
    const why = probed === null || probed.ok ? 'secrets are set to be kept in the file' : `the OS secret store failed a test (${probed.message})`;
    return unchanged(
      `${why}, so the secrets could only go to ${files.secrets}, a plaintext file. Migrating would swap one plaintext file for another, so it was refused.`,
    );
  }
  log('the OS secret store works');

  const did = { secrets: false, connection: false, bootedOut: false, services: false, request: false };
  try {
    did.secrets = true;
    const writes: { name: SecretName; value: Secrets[SecretName] }[] = [{ name: 'x-session', value: session }, ...imports];
    for (const { name, value } of writes) {
      const written = await store.set(name, value);
      if (!written.ok) throw new Stop(`${name} could not be stored: ${written.message}`);
      if (written.backend !== 'keychain') throw new Stop(`${name} went to the file instead of the OS secret store.`);
      log(`stored ${name} in the OS secret store`);
    }

    did.connection = true;
    const connectedAt = new Date();
    writeConnection(files.xConnection, { handle: who.handle, connectedAt: connectedAt.toISOString() });
    // The old job already pulled both histories into Birdclaw's database.
    recordBackfill(files.schedulerState, 'bookmarks', 'completed', connectedAt);
    recordBackfill(files.schedulerState, 'likes', 'completed', connectedAt);
    log('X is connected, with both collections marked as already backfilled');

    if ((await run('launchctl', ['print', job])).code === 0) {
      await must(run, 'launchctl', ['bootout', job]);
      did.bootedOut = true;
      log(`stopped the old job ${label}; ${plist} is kept`);
    } else {
      log(`the old job ${label} is not loaded`);
    }

    did.services = true;
    const since = new Date();
    await install();
    log('installed the web and worker services');

    did.request = true;
    writeSyncRequest(files.syncRequest);
    log(`requested a sync; waiting up to ${Math.round(timeoutMs / 60_000) || '<1'} min for the new worker to finish it`);
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const attempt = readWorkerStatus(files.workerStatus)?.lastAttempt;
      // Only a sync that started after the install proves the new services; the first one decides.
      if (attempt && Date.parse(attempt.startedAt) >= since.getTime()) {
        if (attempt.result !== 'ok' || attempt.runId === null) {
          throw new Stop(`the first sync under the new service ended ${attempt.result}${attempt.message ? `: ${attempt.message}` : ''}.`);
        }
        const checked = checkRun(files.store, attempt.runId);
        if (checked?.ok) break;
        if (checked) throw new Stop(checked.message);
      }
      if (Date.now() >= deadline) throw new Stop(`the first sync under the new service did not finish within ${Math.round(timeoutMs / 1000)} s.`);
      await sleep(pollMs);
    }
    log('the new worker finished a sync with bookmarks and likes both ok');
  } catch (error) {
    const message = error instanceof Stop ? error.message : errorText(error);
    log(`failed: ${message}`);
    return { ok: false, message, state: await rollBack() };
  }

  for (const path of [birdEnv, files.secrets, files.syncStatus, plist]) {
    try {
      rmSync(path, { force: true });
      log(`deleted ${path}`);
    } catch (error) {
      log(`could not delete ${path} (${(error as NodeJS.ErrnoException).code}); delete it by hand`);
    }
  }
  log('migration complete');
  return { ok: true, handle: who.handle };

  /** Undoes what `did` records, each step on its own, and returns what the machine was left with. */
  async function rollBack(): Promise<string[]> {
    const state: string[] = [];
    const step = async (work: () => Promise<void> | void, done: string, failed: (message: string) => string) => {
      try {
        await work();
        state.push(done);
      } catch (error) {
        state.push(failed(error instanceof Stop ? error.message : errorText(error)));
      }
    };

    if (did.request) {
      await step(
        () => removeSyncRequest(files.syncRequest),
        'The sync request is withdrawn.',
        (message) => `${files.syncRequest} could NOT be removed (${message}).`,
      );
    }
    if (did.services) {
      await step(
        uninstall,
        'The x-corpus web and worker services are removed.',
        (message) => `The x-corpus services could NOT be removed (${message}). Remove them with: bun run service:uninstall`,
      );
    }
    if (did.secrets) {
      await step(
        async () => {
          // Straight from the OS store and never through the secret store's delete,
          // which would also take the Jev key out of secrets.env.
          for (const name of SECRET_NAMES) {
            const deleted = await keychain!.delete(name);
            if (!deleted.ok) throw new Stop(`${name}: ${deleted.message}`);
          }
          // Only there if the store fell back to the file after all; the old Jev key stays.
          const fromFile = await fileBackend({ path: files.secrets }).delete('x-session');
          if (!fromFile.ok) throw new Stop(`x-session in ${files.secrets}: ${fromFile.message}`);
        },
        `The secrets copied into the OS secret store (service "${keychainService}") are deleted.`,
        (message) => `The copied secrets could NOT all be deleted from the OS secret store (${message}).`,
      );
      await step(
        () => rmSync(files.secretBackend, { force: true }),
        `${files.secretBackend} is removed, so the Jev key is read from ${files.secrets} again.`,
        (message) => `${files.secretBackend} could NOT be removed (${message}); delete it so the old job finds the Jev key.`,
      );
    }
    if (did.connection) {
      await step(
        () => rmSync(files.xConnection, { force: true }),
        `${files.xConnection} is removed.`,
        (message) => `${files.xConnection} could NOT be removed (${message}).`,
      );
      // Harmless to the old job, which never reads it; a later migration marks them again.
      state.push(`${files.schedulerState} still marks bookmarks and likes as backfilled.`);
    }
    if (did.bootedOut) {
      await step(
        async () => void (await must(run, 'launchctl', ['bootstrap', `gui/${uid}`, plist])),
        `The old job ${label} is loaded again from ${plist}.`,
        (message) => `The old job ${label} is NOT loaded (${message}). Load it with: launchctl bootstrap gui/${uid} ${plist}`,
      );
    } else {
      state.push(`The old job ${label} was not stopped and is as it was.`);
    }
    state.push(`${birdEnv}, ${files.secrets} and ${plist} are unchanged.`);
    return state;
  }
}
