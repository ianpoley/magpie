#!/usr/bin/env node
//
// worker.mjs
// The background sync worker the x-corpus-worker service runs. Every 30
// seconds it writes its heartbeat to state/worker.json and starts a whole
// sync when one is due, overdue or requested (state/sync-request), never
// while another run holds the run lock. SYNC_INTERVAL_HOURS in
// ~/.config/x-corpus/settings.env sets the interval (default 3), read on
// every tick.
//
//     node packages/engine/bin/worker.mjs
//
// On SIGTERM or SIGINT it kills any bird or Birdclaw process a run started,
// releases the run lock and exits 0. The interrupted run's row is closed as
// interrupted by the next run.

import { categorizeDeps } from './run-cli.mjs';

const deps = await categorizeDeps();
const { paths } = await import('../src/config.ts');
const { releaseLock } = await import('../src/lock.ts');
const { createSecretStore } = await import('../src/secrets/store.ts');
const { runSync } = await import('../src/sync/run.ts');
const { startWorker } = await import('../src/sync/worker.ts');
const { createBirdclaw } = await import('../src/x/birdclaw.ts');

const files = paths();
const secrets = createSecretStore();
const x = createBirdclaw();
const log = (line) => console.log(`${new Date().toISOString()} [worker] ${line}`);

const worker = startWorker({
  files,
  runSync: () => runSync(files, { ...deps, x, secrets }),
  secretBackend: () => secrets.backend(),
  log,
});
log(`started (pid ${process.pid})`);

function shutdown(signal) {
  log(`${signal}: stopping`);
  // The tool processes run in their own process groups, so stopping this
  // process alone would leave them running.
  x.killActive();
  void worker.stop();
  releaseLock(files.lock);
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
