import { join } from 'node:path';
import type { TestContext } from 'node:test';

import type { JevClient, JevRequest } from '../../src/jev/client.ts';
import { openStore } from '../../src/store/db.ts';
import type { Store } from '../../src/store/db.ts';
import { tempDir } from './export.ts';

const AT = '2026-01-01T00:00:00.000Z';

/** A fresh store in a temp dir, closed and removed when the test ends. */
export function tempStore(t: TestContext): { db: Store; path: string } {
  const { dir, cleanup } = tempDir();
  const path = join(dir, 'corpus.sqlite');
  const db = openStore(path);
  t.after(() => {
    if (db.isOpen) db.close();
    cleanup();
  });
  return { db, path };
}

export function seedPost(
  db: Store,
  id: string,
  options: { text?: string; quoted?: Record<string, unknown>; bookmarked?: boolean; liked?: boolean } = {},
): string {
  db.prepare(
    `INSERT INTO posts (id, text, url, author_handle, author_name, quoted_json, bookmarked, liked, first_seen_at)
     VALUES (?, ?, ?, 'someone', 'Some One', ?, ?, ?, ?)`,
  ).run(
    id,
    options.text ?? `post ${id} text`,
    `https://x.com/someone/status/${id}`,
    options.quoted ? JSON.stringify(options.quoted) : null,
    (options.bookmarked ?? true) ? 1 : 0,
    options.liked ? 1 : 0,
    AT,
  );
  return id;
}

export function seedArea(
  db: Store,
  name: string,
  options: { hidden?: boolean; kind?: string } = {},
): number {
  const result = db
    .prepare(`INSERT INTO areas (name, kind, hidden, created_at) VALUES (?, ?, ?, ?)`)
    .run(name, options.kind ?? 'auto', options.hidden ? 1 : 0, AT);
  return Number(result.lastInsertRowid);
}

export function seedTopic(
  db: Store,
  name: string,
  options: {
    areaId?: number;
    definition?: string;
    kind?: string;
    state?: string;
    hidden?: boolean;
    mergedInto?: number;
  } = {},
): number {
  const result = db
    .prepare(
      `INSERT INTO topics (area_id, name, definition, kind, state, hidden, merged_into, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      options.areaId ?? null,
      name,
      options.definition ?? `Posts about ${name}.`,
      options.kind ?? 'auto',
      options.state ?? 'active',
      options.hidden ? 1 : 0,
      options.mergedInto ?? null,
      AT,
    );
  return Number(result.lastInsertRowid);
}

export function seedScore(db: Store, postId: string, topicId: number, probability: number, scoredAt: string = AT): void {
  db.prepare(`INSERT INTO scores (post_id, topic_id, probability, scored_at) VALUES (?, ?, ?, ?)`).run(
    postId,
    topicId,
    probability,
    scoredAt,
  );
}

export function seedOverride(db: Store, postId: string, topicId: number, action: 'add' | 'remove' | 'unsure'): void {
  db.prepare(`INSERT INTO overrides (post_id, topic_id, action, created_at) VALUES (?, ?, ?, ?)`).run(
    postId,
    topicId,
    action,
    AT,
  );
}

export function seedLink(
  db: Store,
  postId: string,
  url: string,
  options: {
    status?: string;
    host?: string;
    title?: string;
    description?: string;
    resolvedAt?: string;
  } = {},
): void {
  db.prepare(
    `INSERT INTO links (url, status, host, title, description, resolved_at, first_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    url,
    options.status ?? 'new',
    options.host ?? null,
    options.title ?? null,
    options.description ?? null,
    options.resolvedAt ?? null,
    AT,
  );
  db.prepare(`INSERT INTO post_links (post_id, link_url) VALUES (?, ?)`).run(postId, url);
}

export type FakeJev = JevClient & { requests: JevRequest[] };

/**
 * A Jev stand-in that records every request. `answer` gives the probability
 * for one question of one request, or throws to fail that whole request.
 */
export function fakeJev(answer: (questionId: string, request: JevRequest) => number = () => 0.1): FakeJev {
  const requests: JevRequest[] = [];
  return {
    requests,
    async ask(request) {
      requests.push(request);
      const answers: Record<string, number> = {};
      for (const id of Object.keys(request.questions)) answers[id] = answer(id, request);
      return answers;
    },
  };
}
