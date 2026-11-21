import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname } from 'node:path';

import { STORE_BUSY_TIMEOUT_MS, inheritedStore } from '../config.ts';
import { SCHEMA_VERSION, assertKnownVersion, migrate } from './schema.ts';

export type Store = DatabaseSync;

/**
 * Opens the store at `path`.
 *
 * Read-write (the default) creates the file and its directory when missing,
 * switches it to WAL, and migrates it to the current schema.
 *
 * Read-only never creates or changes the file. It fails when the file is
 * missing or its schema is not the version this code knows.
 *
 * Either mode fails when the store was written by newer code. The caller
 * closes the returned handle.
 *
 * A linked worktree borrows its main checkout's store. Read-write refuses to
 * migrate that store: the installed services run the main checkout's code,
 * and a store upgraded past it would stop them. `inheritedFrom` names that
 * main checkout; it is worked out from the path by default.
 */
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
      migrate(db);
    }
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

/**
 * Runs `fn` in one write transaction: committed when it returns, rolled back
 * when it throws. Called inside a transaction already open on `db`, it joins
 * that transaction, so the outermost call decides the outcome.
 */
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
