import { readFileSync } from 'node:fs';

import { paths } from './config.ts';

const LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(?:"([^"]*)"|'([^']*)'|([^\s#]*))\s*(?:#.*)?$/;

/**
 * Reads `KEY=value` lines, with an optional `export` and optional quotes.
 * Nothing is expanded or executed; lines in any other shape are ignored.
 */
export function parseSecrets(text: string): Record<string, string> {
  const secrets: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = LINE.exec(line);
    if (match) secrets[match[1]] = match[2] ?? match[3] ?? match[4];
  }
  return secrets;
}

/** The secrets in the file at `path`; none when the file does not exist. */
export function readSecrets(path: string = paths().secrets): Record<string, string> {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
  return parseSecrets(text);
}
