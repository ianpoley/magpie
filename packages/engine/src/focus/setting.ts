import { existsSync, mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname } from 'node:path';

import { DEV_FOCUS_WORDING, STORE_BUSY_TIMEOUT_MS, paths } from '../config.ts';
import type { Paths } from '../config.ts';
import { readJsonObject, updateJson } from '../sync/state.ts';

export const FOCUS_MARKER_VERSION = 4;

export type FocusMode = 'all' | 'focus';
export type FocusSetting = { mode: FocusMode; focus: string };
export type ResolvedFocus = FocusSetting & { chosen: boolean };

const NOT_CHOSEN: ResolvedFocus = { mode: 'all', focus: '', chosen: false };
const LEGACY: ResolvedFocus = { mode: 'focus', focus: DEV_FOCUS_WORDING, chosen: true };

const isMode = (value: unknown): value is FocusMode => value === 'all' || value === 'focus';

function savedSetting(path: string): FocusSetting | null {
  const record = readJsonObject(path);
  if (!isMode(record.mode)) return null;
  return { mode: record.mode, focus: typeof record.focus === 'string' ? record.focus : '' };
}

function isLegacyStore(path: string): boolean {
  if (!existsSync(path)) return false;
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    db.exec(`PRAGMA busy_timeout = ${STORE_BUSY_TIMEOUT_MS}`);
    const meta = (key: string) => db.prepare(`SELECT value FROM meta WHERE key = ?`).get(key)?.value;
    if (meta('category_focus_legacy') === '1') return true;
    if (Number(meta('schema_version') ?? 0) >= FOCUS_MARKER_VERSION) return false;
    return db.prepare(`SELECT 1 FROM areas WHERE kind = 'auto' AND state = 'active' LIMIT 1`).get() !== undefined;
  } finally {
    db.close();
  }
}

export function readFocus(files: Pick<Paths, 'categoryFocus' | 'store'> = paths()): ResolvedFocus {
  const saved = savedSetting(files.categoryFocus);
  if (saved) return { ...saved, chosen: true };
  return isLegacyStore(files.store) ? LEGACY : NOT_CHOSEN;
}

export function writeFocus(path: string, setting: FocusSetting): void {
  if (!isMode(setting.mode)) throw new Error(`Category focus mode must be "all" or "focus", not ${JSON.stringify(setting.mode)}.`);
  const focus = setting.focus.trim();
  if (setting.mode === 'focus' && focus === '') throw new Error('Category focus needs a description of what to focus on.');
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  updateJson(path, () => ({ mode: setting.mode, focus }));
}
