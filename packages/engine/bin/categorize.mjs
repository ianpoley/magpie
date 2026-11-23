#!/usr/bin/env node

import { RUN_OPTIONS_USAGE, categorizeDeps, printStages, readRunOptions } from './run-cli.mjs';

const options = readRunOptions(`Usage: categorize.mjs [options]\n\n${RUN_OPTIONS_USAGE}`);
const deps = await categorizeDeps();
const { paths } = await import('../src/config.ts');
const { runCategorize } = await import('../src/sync/run.ts');
const { errorText } = await import('../src/util.ts');

try {
  const result = await runCategorize(paths(), deps, options);
  if (result.status === 'locked') {
    console.error(`[categorize] another run holds the lock (pid ${result.pid}); nothing was done`);
    process.exit(1);
  }
  console.log(`[categorize] run ${result.runId} complete; upstream X sync: ${result.upstreamSync}`);
  await printStages('[categorize]', result.stages, 9);
} catch (error) {
  console.error(`[categorize] the run could not start: ${errorText(error)}`);
  process.exit(1);
}
