#!/usr/bin/env node
//
//     node packages/engine/bin/sync.mjs [--limit-posts N] [--skip-links] [--skip-evolve]   (or: bun run sync)
//
// Exits 0 when the run reached its end, even if a stage failed (the summary
// and the run row say which). Exits 1 when a run is already in progress or
// the run could not start, and 2 for a bad argument.

import { RUN_OPTIONS_USAGE, categorizeDeps, printStages, readRunOptions } from './run-cli.mjs';

const options = readRunOptions(`Usage: sync.mjs [options]\n\n${RUN_OPTIONS_USAGE}`);
const deps = await categorizeDeps();
const { paths } = await import('../src/config.ts');
const { createSecretStore } = await import('../src/secrets/store.ts');
const { runSync } = await import('../src/sync/run.ts');
const { createBirdclaw } = await import('../src/x/birdclaw.ts');
const { errorText } = await import('../src/util.ts');

try {
  const result = await runSync(paths(), { ...deps, x: createBirdclaw(), secrets: createSecretStore() }, options);
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
