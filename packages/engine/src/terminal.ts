import { homedir } from 'node:os';

type Stream = { isTTY?: boolean };

export function colorEnabled(stream: Stream, env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NO_COLOR) return false;
  if (env.FORCE_COLOR && env.FORCE_COLOR !== '0') return true;
  return Boolean(stream.isTTY) && env.TERM !== 'dumb';
}

const CODES = {
  bold: [1, 22],
  dim: [2, 22],
  red: [31, 39],
  green: [32, 39],
  yellow: [33, 39],
  cyan: [36, 39],
} as const;

export type Paint = Record<keyof typeof CODES, (text: string) => string>;

export function painter(enabled: boolean): Paint {
  const style = ([open, close]: readonly [number, number]) => (text: string) => (enabled ? `\x1b[${open}m${text}\x1b[${close}m` : text);
  return {
    bold: style(CODES.bold),
    dim: style(CODES.dim),
    red: style(CODES.red),
    green: style(CODES.green),
    yellow: style(CODES.yellow),
    cyan: style(CODES.cyan),
  };
}

export const out = painter(colorEnabled(process.stdout));
export const err = painter(colorEnabled(process.stderr));

export type Level = 'ok' | 'warn' | 'fail';

export function terminalUi(paint: Paint = out) {
  const mark: Record<Level, string> = { ok: paint.green('✓'), warn: paint.yellow('▲'), fail: paint.red('✗') };
  return {
    paint,
    mark,
    intro: (title: string) => `${paint.dim('┌')}  ${paint.bold(title)}`,
    rail: (line = '') => (line ? `${paint.dim('│')}  ${line}` : paint.dim('│')),
    step: (title: string) => `${paint.cyan('◇')}  ${paint.bold(title)}`,
    question: (text: string, defaultYes: boolean) => `${paint.cyan('◆')}  ${text} ${paint.dim(defaultYes ? '(Y/n)' : '(y/N)')} `,
    prompt: (text: string) => `${paint.cyan('◆')}  ${text} `,
    outro: (line: string) => `${paint.dim('└')}  ${line}`,
    check: (level: Level, name: string, detail: string) => `${mark[level]} ${name.padEnd(12)}  ${paint.dim(detail)}`,
  };
}

export const ui = terminalUi();

export function tildePaths(text: string, home = homedir()): string {
  return home ? text.split(`${home}/`).join('~/') : text;
}
