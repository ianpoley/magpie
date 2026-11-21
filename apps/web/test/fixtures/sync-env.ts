import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { join } from "node:path";
import type { TestContext } from "node:test";

import { tempDir } from "../../../../packages/engine/test/fixtures/export.ts";

const scratch = tempDir();
export const root = join(scratch.dir, "root");
export const configDir = join(scratch.dir, "config");
export const stateDir = join(root, "state");
const birdLog = join(scratch.dir, "bird.log");
const bird = join(scratch.dir, "bird");

process.env.MAGPIE_ROOT = root;
process.env.MAGPIE_STORE = join(stateDir, "corpus.sqlite");
process.env.MAGPIE_CONFIG_DIR = configDir;
process.env.MAGPIE_SECRET_BACKEND = "file";
process.env.MAGPIE_KEYCHAIN_SERVICE = "magpie-web-test";
process.env.BIRDCLAW_HOME = join(scratch.dir, "birdclaw");
process.env.MAGPIE_BIRD_BIN = bird;
process.env.MAGPIE_BIRDCLAW_BIN = bird;
process.env.TYPESAFE_API_KEY = "";

const jevChecks: string[] = [];
const typesafe = createServer((request, response) => {
  const key = (request.headers.authorization ?? "").replace(/^Bearer /, "");
  jevChecks.push(`${request.method} ${request.url}`);
  if (key.startsWith("offline")) return request.socket.destroy();
  if (key.startsWith("good")) return response.writeHead(200, { "content-type": "application/json" }).end('{"models":[]}');
  response.writeHead(401, { "content-type": "application/json" }).end('{"error":"unauthorized"}');
});
await new Promise<void>((resolve) => typesafe.listen(0, "127.0.0.1", resolve));
typesafe.unref();
const { port } = typesafe.address() as { port: number };
process.env.TYPESAFE_BASE_URL = `http://127.0.0.1:${port}`;
export const typesafeCalls = (): string[] => [...jevChecks];

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
  jevChecks.length = 0;
  mkdirSync(stateDir, { recursive: true });
  t.after(() => {
    for (const path of [configDir, root, birdLog]) rmSync(path, { recursive: true, force: true });
  });
}

export const cleanupScratch = scratch.cleanup;

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

export function writeHeartbeat(ageMs: number, nextRunAt: string | null = null): void {
  const heartbeatAt = new Date(Date.now() - ageMs).toISOString();
  writeFileSync(
    join(stateDir, "worker.json"),
    JSON.stringify({ pid: 1, heartbeatAt, state: "idle", schedule: "scheduled", nextRunAt, lastAttempt: null, secretBackend: "file" }),
  );
}

export function holdRunLock(t: TestContext): void {
  const owner = spawn("sleep", ["30"], { stdio: "ignore" });
  t.after(() => owner.kill());
  writeFileSync(join(stateDir, "run.lock"), JSON.stringify({ pid: owner.pid }));
}

export const syncRequestPath = join(stateDir, "sync-request");
export const connectionPath = join(configDir, "x-connection.json");
