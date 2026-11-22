#!/usr/bin/env node

import { RUN_OPTIONS_USAGE, categorizeDeps, printStages, readRunOptions } from './run-cli.mjs';

export async function syncCommand(args) {
  const options = readRunOptions(`Usage: sync.mjs [options]\n\n${RUN_OPTIONS_USAGE}`, args);
  const deps = await categorizeDeps();
  const { paths } = await import('../src/config.ts');
  const { createSecretStore } = await import('../src/secrets/store.ts');
  const { runSync } = await import('../src/sync/run.ts');
  const { createBirdclaw } = await import('../src/x/birdclaw.ts');
  const { errorText } = await import('../src/util.ts');
  const { releaseLock } = await import('../src/lock.ts');

  const files = paths();
  const x = createBirdclaw();
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => {
      console.error(`[sync] ${signal}: stopping`);
      x.killActive();
      releaseLock(files.lock);
      process.exit(1);
    });
  }

  try {
    const result = await runSync(files, { ...deps, x, secrets: createSecretStore() }, options);
    if (result.status === 'locked') {
      console.error(`[sync] a run is already in progress (pid ${result.pid}); nothing was done`);
      process.exit(1);
    }
    const who = result.auth.handle ? ` as @${result.auth.handle}` : '';
    console.log(`[sync] run ${result.runId} complete; X: ${result.auth.status}${who}; upstream X sync: ${result.upstreamSync}`);
    printStages('[sync]', result.stages, 11);
  } catch (error) {
    console.error(`[sync] the run could not start: ${errorText(error)}`);
    process.exit(1);
  }
}

if (import.meta.main) await syncCommand(process.argv.slice(2));
