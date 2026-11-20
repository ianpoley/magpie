import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { join } from "node:path";
import type { TestContext } from "node:test";

import { tempDir } from "../../../../packages/engine/test/fixtures/export.ts";

/**
 * A scratch install for the sync actions and the status route: repo root,
 * store, per-user config and Birdclaw home all in one temp dir, secrets in
 * the owner-only file (never the OS keychain), and a stub `bird` that acts
 * on the auth_token it is given:
 *
 *   good…      whoami names @owner
 *   probe…     whoami fails without saying why, one page of bookmarks works
 *   rejected…  whoami fails without saying why, bookmarks get HTTP 401
 *   offline…   whoami cannot reach X
 *
 * Importing this sets the environment, so import it before anything that
 * reads it. Nothing is ever unset, so no test can reach the real install.
 */
const scratch = tempDir();
export const root = join(scratch.dir, "root");
export const configDir = join(scratch.dir, "config");
export const stateDir = join(root, "state");
const birdLog = join(scratch.dir, "bird.log");
const bird = join(scratch.dir, "bird");

process.env.X_CORPUS_ROOT = root;
process.env.X_CORPUS_STORE = join(stateDir, "corpus.sqlite");
process.env.X_CORPUS_CONFIG_DIR = configDir;
process.env.X_CORPUS_SECRET_BACKEND = "file";
process.env.X_CORPUS_KEYCHAIN_SERVICE = "x-corpus-web-test";
process.env.BIRDCLAW_HOME = join(scratch.dir, "birdclaw");
process.env.X_CORPUS_BIRD_BIN = bird;
process.env.X_CORPUS_BIRDCLAW_BIN = bird;

writeFileSync(
  bird,
  `#!/bin/sh
echo "$1" >> '${birdLog}'
case "$AUTH_TOKEN:$1" in
  good*:whoami) echo 'user: @owner (Owner)'; exit 0 ;;
  probe*:whoami|rejected*:whoami) echo '[err] Failed to determine current user: Could not parse settings page for user info' >&2; exit 1 ;;
  probe*:bookmarks) echo 'one bookmark'; exit 0 ;;
  rejected*:bookmarks) echo '[err] Failed to fetch bookmarks: HTTP 401: {"errors":[{"message":"Could not authenticate you","code":32}]}' >&2; exit 1 ;;
  offline*:whoami) echo '[err] Failed to determine current user: fetch failed' >&2; exit 1 ;;
esac
exit 99
`,
);
chmodSync(bird, 0o755);

export const birdCalls = (): string[] => (existsSync(birdLog) ? readFileSync(birdLog, "utf8").split("\n").filter(Boolean) : []);

export function freshInstall(t: TestContext): void {
  for (const path of [configDir, root, birdLog]) rmSync(path, { recursive: true, force: true });
  mkdirSync(stateDir, { recursive: true });
  t.after(() => {
    for (const path of [configDir, root, birdLog]) rmSync(path, { recursive: true, force: true });
  });
}

export const cleanupScratch = scratch.cleanup;

/** Next resolves these when it builds; plain node needs telling. */
export function resolveLikeNext(): void {
  const src = new URL("../../src/", import.meta.url);
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === "next/cache") return nextResolve(new URL("./next-cache.ts", import.meta.url).href, context);
      if (specifier === "next/server") return nextResolve(new URL("./next-server.ts", import.meta.url).href, context);
      if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, src).href, context);
      return nextResolve(specifier, context);
    },
  });
}

/** A worker heartbeat written `ageMs` ago, with its next scheduled run. */
export function writeHeartbeat(ageMs: number, nextRunAt: string | null = null): void {
  const heartbeatAt = new Date(Date.now() - ageMs).toISOString();
  writeFileSync(
    join(stateDir, "worker.json"),
    JSON.stringify({ pid: 1, heartbeatAt, state: "idle", schedule: "scheduled", nextRunAt, lastAttempt: null, secretBackend: "file" }),
  );
}

/** A run lock held by another live process, as a sync started elsewhere would hold it. */
export function holdRunLock(t: TestContext): void {
  const owner = spawn("sleep", ["30"], { stdio: "ignore" });
  t.after(() => owner.kill());
  writeFileSync(join(stateDir, "run.lock"), JSON.stringify({ pid: owner.pid }));
}

export const syncRequestPath = join(stateDir, "sync-request");
export const connectionPath = join(configDir, "x-connection.json");
