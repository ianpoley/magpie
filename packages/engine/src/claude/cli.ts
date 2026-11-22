import { spawn } from 'node:child_process';

import { CLAUDE, paths } from '../config.ts';
import { MESSAGE_MAX_CHARS, isRecord } from '../util.ts';
import { schemaErrors } from './schemas.ts';
import type { JsonSchema } from './schemas.ts';

export type ClaudeRequest = { prompt: string; schema: JsonSchema };

export type ClaudeFailure = {
  ok: false;
  reason: 'missing' | 'timeout' | 'exit' | 'output' | 'schema';
  message: string;
};

export type ClaudeSendResult =
  | {
      ok: true;
      value: unknown;
      session: Record<string, unknown> | null;
    }
  | ClaudeFailure;

export type ClaudeSendOptions = {
  onPartial?: (json: string) => void;
  signal?: AbortSignal;
};

export interface ClaudeAdapter {
  send(request: ClaudeRequest, options?: ClaudeSendOptions): Promise<ClaudeSendResult>;
}

export type ClaudeAnswer<T> = { ok: true; value: T } | ClaudeFailure;

export async function askJson<T>(adapter: ClaudeAdapter, request: ClaudeRequest): Promise<ClaudeAnswer<T>> {
  const sent = await adapter.send(request);
  if (!sent.ok) return sent;
  const errors = schemaErrors(request.schema, sent.value);
  if (errors.length > 0) {
    return { ok: false, reason: 'schema', message: errors.slice(0, 5).join('; ') };
  }
  return { ok: true, value: sent.value as T };
}

function partialJson(line: string): string {
  let event: unknown;
  try {
    event = JSON.parse(line);
  } catch {
    return '';
  }
  if (!isRecord(event) || event.type !== 'stream_event' || !isRecord(event.event)) return '';
  const delta = event.event.delta;
  return isRecord(delta) && delta.type === 'input_json_delta' && typeof delta.partial_json === 'string' ? delta.partial_json : '';
}

function cliArgs(schema: JsonSchema, partial: boolean): string[] {
  return [
    '--print',
    '--model',
    CLAUDE.model,
    '--effort',
    CLAUDE.effort,
    '--output-format',
    'stream-json',
    '--verbose',
    ...(partial ? ['--include-partial-messages'] : []),
    '--tools',
    '',
    '--strict-mcp-config',
    '--safe-mode',
    '--disable-slash-commands',
    '--no-session-persistence',
    '--json-schema',
    JSON.stringify(schema),
  ];
}

type Stream = { session: Record<string, unknown> | null; result: Record<string, unknown> | null };

function readStream(stdout: string): Stream {
  let session: Record<string, unknown> | null = null;
  let result: Record<string, unknown> | null = null;
  for (const line of stdout.split('\n')) {
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isRecord(event)) continue;
    if (event.type === 'system' && event.subtype === 'init') session = event;
    if (event.type === 'result') result = event;
  }
  return { session, result };
}

const resultText = (result: Record<string, unknown> | null): string =>
  typeof result?.result === 'string' ? result.result : '';

function readAnswer(stdout: string): ClaudeSendResult {
  const { session, result } = readStream(stdout);
  if (!result) return { ok: false, reason: 'output', message: 'The CLI printed no result.' };
  if (result.is_error === true || result.structured_output === undefined) {
    return {
      ok: false,
      reason: 'output',
      message: `The CLI returned no structured answer (${String(result.subtype)}). ${resultText(result)}`
        .trim()
        .slice(0, MESSAGE_MAX_CHARS),
    };
  }
  return { ok: true, value: result.structured_output, session };
}

export function createClaudeCli(options: { cliPath?: string; timeoutMs?: number } = {}): ClaudeAdapter {
  const cliPath = options.cliPath ?? paths().claudeCli;
  const timeoutMs = options.timeoutMs ?? CLAUDE.timeoutMs;

  return {
    send: (request, options = {}) =>
      new Promise((resolve) => {
        const { onPartial, signal } = options;
        if (signal?.aborted) return resolve({ ok: false, reason: 'exit', message: 'The call was cancelled.' });
        const child = spawn(cliPath, cliArgs(request.schema, onPartial !== undefined), { stdio: ['pipe', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        let settled = false;
        const cancel = () => {
          child.kill('SIGKILL');
          settle({ ok: false, reason: 'exit', message: 'The call was cancelled.' });
        };
        const settle = (result: ClaudeSendResult) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          signal?.removeEventListener('abort', cancel);
          resolve(result);
        };
        signal?.addEventListener('abort', cancel, { once: true });
        const timer = setTimeout(() => {
          child.kill('SIGKILL');
          settle({ ok: false, reason: 'timeout', message: `The CLI did not finish within ${timeoutMs} ms.` });
        }, timeoutMs);

        let unread = '';
        child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
          stdout += chunk;
          if (!onPartial || settled) return;
          const lines = (unread + chunk).split('\n');
          unread = lines.pop() ?? '';
          for (const line of lines) {
            const json = partialJson(line);
            if (json !== '') onPartial(json);
          }
        });
        child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
        child.on('error', (error: NodeJS.ErrnoException) => {
          settle({
            ok: false,
            reason: error.code === 'ENOENT' ? 'missing' : 'exit',
            message: `Could not start ${cliPath}: ${error.message}`,
          });
        });
        child.on('close', (code, signal) => {
          if (code !== 0) {
            const detail = `${resultText(readStream(stdout).result)} ${stderr.trim()}`.trim().slice(0, MESSAGE_MAX_CHARS);
            settle({
              ok: false,
              reason: 'exit',
              message: `The CLI exited with ${code === null ? `signal ${signal}` : `code ${code}`}. ${detail}`.trim(),
            });
          } else {
            settle(readAnswer(stdout));
          }
        });
        child.stdin.on('error', () => {});
        child.stdin.end(request.prompt);
      }),
  };
}
