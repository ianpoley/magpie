import { readFileSync } from 'node:fs';

import { paths } from './config.ts';

const LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(?:"([^"]*)"|'([^']*)'|([^\s#]*))\s*(?:#.*)?$/;

export function parseSecrets(text: string): Record<string, string> {
  const secrets: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = LINE.exec(line);
    if (match) secrets[match[1]] = match[2] ?? match[3] ?? match[4];
  }
  return secrets;
}

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
