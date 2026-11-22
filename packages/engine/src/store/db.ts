import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'node:path';

import { STORE_BUSY_TIMEOUT_MS, inheritedStore } from '../config.ts';
import { SCHEMA_VERSION, assertKnownVersion, migrate } from './schema.ts';

export type Store = DatabaseSync;

export function openStore(path: string, options: { readOnly?: boolean; inheritedFrom?: string | null } = {}): Store {
  const readOnly = options.readOnly === true;
  const inheritedFrom = options.inheritedFrom === undefined ? inheritedStore(path) : options.inheritedFrom;
  if (!readOnly) mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path, { readOnly });
  try {
    db.exec(`PRAGMA busy_timeout = ${STORE_BUSY_TIMEOUT_MS}`);
    db.exec('PRAGMA foreign_keys = ON');
    if (readOnly) {
      const version = assertKnownVersion(db);
      if (version !== SCHEMA_VERSION) {
        throw new Error(
          `Store at ${path} has schema version ${version}; this code needs version ${SCHEMA_VERSION}. Open it read-write once to migrate it.`,
        );
      }
    } else {
      const version = assertKnownVersion(db);
      if (inheritedFrom && version > 0 && version < SCHEMA_VERSION) {
        throw new Error(
          `The store at ${path} belongs to the main checkout ${inheritedFrom} and is at schema version ${version}; this worktree's code would upgrade it to version ${SCHEMA_VERSION}, which the installed services would then refuse. Set MAGPIE_ROOT to a copy of that data root, or land the migration on the main checkout first.`,
        );
      }
      db.exec('PRAGMA journal_mode = WAL');
      if (version > 0 && version < SCHEMA_VERSION) backUpBeforeMigrating(db, path, version);
      migrate(db);
    }
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

function backUpBeforeMigrating(db: Store, path: string, version: number): void {
  const backupsDir = join(dirname(path), 'backups');
  mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(':', '-');
  const backup = join(backupsDir, `corpus-v${version}-${stamp}.sqlite`);
  db.prepare('VACUUM INTO ?').run(backup);
}

export function transaction<T>(db: Store, fn: () => T): T {
  if (db.isTransaction) return fn();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw error;
  }
}
