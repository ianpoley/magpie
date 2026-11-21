#!/usr/bin/env node
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
  x.killActive();
  void worker.stop();
  releaseLock(files.lock);
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
