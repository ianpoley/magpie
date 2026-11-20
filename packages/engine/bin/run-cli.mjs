// run-cli.mjs
// What the sync and categorize commands share: their options, the clients
// the categorize stages use, and the stage summary they print.

import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { parseArgs } from 'node:util';

export const RUN_OPTIONS_USAGE = `  --limit-posts N  score at most N posts in this run
  --skip-links     do not resolve links
  --skip-evolve    leave the category list alone: no first discovery and no
                   evolution, so Claude is not called
  --help           show this text`;

/** Parses the shared options. Prints the usage and exits 0 for --help, or 2 for a bad argument. */
export function readRunOptions(usage) {
  let values;
  try {
    ({ values } = parseArgs({
      options: {
        'limit-posts': { type: 'string' },
        'skip-links': { type: 'boolean', default: false },
        'skip-evolve': { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
      },
    }));
    const limit = values['limit-posts'];
    if (limit !== undefined && !/^\d+$/.test(limit)) throw new Error('--limit-posts needs a whole number');
  } catch (error) {
    console.error(`${error.message}\n\n${usage}`);
    process.exit(2);
  }
  if (values.help) {
    console.log(usage);
    process.exit(0);
  }
  const limit = values['limit-posts'];
  return {
    limitPosts: limit === undefined ? undefined : Number(limit),
    skipLinks: values['skip-links'],
    skipEvolve: values['skip-evolve'],
  };
}

/** The web, Jev and Claude clients the categorize stages use. */
export async function categorizeDeps() {
  // launchd and systemd start jobs with a bare PATH; the Claude CLI lives in ~/.local/bin.
  process.env.PATH = [join(homedir(), '.local', 'bin'), process.env.PATH].filter(Boolean).join(delimiter);
  const { createClaudeCli } = await import('../src/claude/cli.ts');
  const { createJevClient } = await import('../src/jev/client.ts');
  const { fetchHttp } = await import('../src/links/http.ts');

  // Built on first use: a missing API key then fails the tagging stage, not the whole run.
  // The pending client is shared, so concurrent first asks read the secret store once.
  let jevClient;
  const jev = {
    ask: async (request, askOptions) => (await (jevClient ??= createJevClient())).ask(request, askOptions),
  };
  return { http: fetchHttp, jev, claude: createClaudeCli() };
}

const summarize = (value) =>
  Object.entries(value)
    .map(([key, item]) =>
      typeof item === 'object' && item !== null ? `${key}(${summarize(item)})` : `${key}=${item}`,
    )
    .join(' ');

/** Prints one line per stage, and its message on the line after. */
export function printStages(prefix, stages, nameWidth) {
  for (const stage of stages) {
    const line = [stage.stage.padEnd(nameWidth), stage.outcome.padEnd(7), summarize(stage.counts)].join(' ').trimEnd();
    console.log(`${prefix}   ${line}${stage.message ? `\n${prefix}     ${stage.message}` : ''}`);
  }
}
