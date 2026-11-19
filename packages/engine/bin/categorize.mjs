#!/usr/bin/env node
//
// categorize.mjs
// Brings the local store up to date with the exported bookmarks and likes:
// ingest, resolve links, score posts against topics, grow the category list.
//
//     node packages/engine/bin/categorize.mjs [--limit-posts N] [--skip-links] [--skip-evolve]
//
// Exits 0 when the run reached its end, even if a stage failed or warned (the
// summary and the run row say which). Exits 1 when another run holds the lock
// or the run could not start, and 2 for a bad argument.

import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { parseArgs } from 'node:util';

const USAGE = `Usage: categorize.mjs [options]

  --limit-posts N  score at most N posts in this run
  --skip-links     do not resolve links
  --skip-evolve    leave the category list alone: no first discovery and no
                   evolution, so Claude is not called
  --help           show this text`;

function readOptions() {
  const { values } = parseArgs({
    options: {
      'limit-posts': { type: 'string' },
      'skip-links': { type: 'boolean', default: false },
      'skip-evolve': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
  const limit = values['limit-posts'];
  if (limit !== undefined && !/^\d+$/.test(limit)) throw new Error('--limit-posts needs a whole number');
  return {
    help: values.help,
    limitPosts: limit === undefined ? undefined : Number(limit),
    skipLinks: values['skip-links'],
    skipEvolve: values['skip-evolve'],
  };
}

let options;
try {
  options = readOptions();
} catch (error) {
  console.error(`${error.message}\n\n${USAGE}`);
  process.exit(2);
}
if (options.help) {
  console.log(USAGE);
  process.exit(0);
}

// launchd starts jobs with a bare PATH; the Claude CLI lives in ~/.local/bin.
process.env.PATH = [join(homedir(), '.local', 'bin'), process.env.PATH].filter(Boolean).join(delimiter);

const { createClaudeCli } = await import('../src/claude/cli.ts');
const { paths } = await import('../src/config.ts');
const { createJevClient } = await import('../src/jev/client.ts');
const { fetchHttp } = await import('../src/links/http.ts');
const { runPipeline } = await import('../src/pipeline.ts');

// Built on first use: a missing API key then fails the tagging stage, not the whole run.
let jevClient;
const jev = {
  ask: async (request, askOptions) => (jevClient ??= createJevClient()).ask(request, askOptions),
};

const summarize = (value) =>
  Object.entries(value)
    .map(([key, item]) =>
      typeof item === 'object' && item !== null ? `${key}(${summarize(item)})` : `${key}=${item}`,
    )
    .join(' ');

try {
  const result = await runPipeline(
    paths(),
    { http: fetchHttp, jev, claude: createClaudeCli() },
    { limitPosts: options.limitPosts, skipLinks: options.skipLinks, skipEvolve: options.skipEvolve },
  );
  if (result.status === 'locked') {
    console.error(`[categorize] another run holds the lock (pid ${result.pid}); nothing was done`);
    process.exit(1);
  }
  console.log(`[categorize] run ${result.runId} complete; upstream X sync: ${result.upstreamSync}`);
  for (const stage of result.stages) {
    const line = [stage.stage.padEnd(9), stage.outcome.padEnd(7), summarize(stage.counts)].join(' ').trimEnd();
    console.log(`[categorize]   ${line}${stage.message ? `\n[categorize]     ${stage.message}` : ''}`);
  }
} catch (error) {
  console.error(`[categorize] the run could not start: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
