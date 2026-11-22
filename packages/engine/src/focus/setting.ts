import { mkdirSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { dirname } from 'node:path';

import { paths } from '../config.ts';
import type { Paths } from '../config.ts';
import { readJsonObject, updateJson } from '../sync/state.ts';

export type FocusMode = 'all' | 'focus';
export type FocusSetting = { mode: FocusMode; focus: string };
export type ResolvedFocus = FocusSetting & { chosen: boolean };

const NOT_CHOSEN: ResolvedFocus = { mode: 'all', focus: '', chosen: false };

const isMode = (value: unknown): value is FocusMode => value === 'all' || value === 'focus';

function savedSetting(path: string): FocusSetting | null {
  const record = readJsonObject(path);
  if (!isMode(record.mode)) return null;
  return { mode: record.mode, focus: typeof record.focus === 'string' ? record.focus : '' };
}

export function hasAutoAreas(db: DatabaseSync): boolean {
  return db.prepare(`SELECT 1 FROM areas WHERE kind = 'auto' AND state = 'active' LIMIT 1`).get() !== undefined;
}

export function readFocus(files: Pick<Paths, 'categoryFocus'> = paths()): ResolvedFocus {
  const saved = savedSetting(files.categoryFocus);
  return saved ? { ...saved, chosen: true } : NOT_CHOSEN;
}

export function writeFocus(path: string, setting: FocusSetting): void {
  if (!isMode(setting.mode)) throw new Error(`Category focus mode must be "all" or "focus", not ${JSON.stringify(setting.mode)}.`);
  const focus = setting.focus.trim();
  if (setting.mode === 'focus' && focus === '') throw new Error('Category focus needs a description of what to focus on.');
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  updateJson(path, () => ({ mode: setting.mode, focus }));
}
