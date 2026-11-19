import assert from 'node:assert/strict';
import type { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { test } from 'node:test';
import type { TestContext } from 'node:test';

import { ingest } from '../src/ingest.ts';
import type { HttpFetch, HttpResponse } from '../src/links/http.ts';
import { resolveLinks } from '../src/links/resolve.ts';
import { openStore } from '../src/store/db.ts';
import { exportPost, tempDir, writeExports } from './fixtures/export.ts';

type Route = HttpResponse | Error;
type SeedPost = { id: string; urls: (string | { url: string; expandedUrl: string })[] };

const HOUR = 60 * 60 * 1000;
const REPO_API = 'https://api.github.com/repos/acme/motion';

const href = (url: string) => new URL(url).href;

function page(title: string | null, description?: string): HttpResponse {
  const head = [
    title === null ? '' : `<title>${title}</title>`,
    description === undefined ? '' : `<meta name="description" content="${description}">`,
  ].join('');
  return {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: `<!doctype html><html><head>${head}</head><body><h1>hi</h1></body></html>`,
  };
}

const redirect = (to: string): HttpResponse => ({ status: 301, headers: { location: to }, body: '' });

const repoApi = (fields: Record<string, unknown>): HttpResponse => ({
  status: 200,
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify(fields),
});

const rateLimited: HttpResponse = {
  status: 403,
  headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': '0' },
  body: JSON.stringify({ message: 'API rate limit exceeded' }),
};

function setup(t: TestContext, posts: SeedPost[], routes: Record<string, Route> = {}) {
  const { dir, cleanup } = tempDir();
  const db = openStore(join(dir, 'corpus.sqlite'));
  t.after(() => {
    db.close();
    cleanup();
  });

  const table = new Map<string, Route>();
  const calls: string[] = [];
  const web = {
    calls,
    set(url: string, route: Route) {
      table.set(href(url), route);
    },
  };
  for (const [url, route] of Object.entries(routes)) web.set(url, route);
  const http: HttpFetch = async (request) => {
    calls.push(request.url);
    const route = table.get(href(request.url));
    if (route === undefined) throw new Error(`test has no route for ${request.url}`);
    if (route instanceof Error) throw route;
    return route;
  };

  const clock = { now: new Date('2026-06-01T00:00:00.000Z') };
  const advance = (ms: number) => {
    clock.now = new Date(clock.now.getTime() + ms);
  };
  const run = () => resolveLinks(db, { http, now: () => clock.now });

  const add = (more: SeedPost[]) => {
    posts = [...posts, ...more];
    const records = posts.map((post) =>
      exportPost(post.id, { urls: post.urls.map((u) => (typeof u === 'string' ? { url: u } : u)) }),
    );
    ingest(db, writeExports(dir, { bookmarks: records, likes: [] }));
  };
  add([]);

  return { db, web, run, advance, add };
}

function link(db: DatabaseSync, url: string) {
  const row = db.prepare('SELECT * FROM links WHERE url = ?').get(url);
  assert.ok(row, `no link row for ${url}`);
  return row;
}

/** Each resource's key with the ids of the posts that link to it. */
function groups(db: DatabaseSync): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const row of db.prepare('SELECT id, canonical_key FROM resources ORDER BY canonical_key').all()) {
    out[String(row.canonical_key)] = db
      .prepare(
        `SELECT DISTINCT pl.post_id FROM post_links pl JOIN links l ON l.url = pl.link_url
         WHERE l.resource_id = ? ORDER BY pl.post_id`,
      )
      .all(row.id)
      .map((r) => String(r.post_id));
  }
  return out;
}

const libraryPosts: SeedPost[] = [
  { id: '1', urls: ['https://t.co/repo'] },
  { id: '2', urls: ['https://t.co/site'] },
  { id: '3', urls: ['https://t.co/docs'] },
  { id: '4', urls: ['https://t.co/tree'] },
];

const libraryRoutes: Record<string, Route> = {
  'https://t.co/repo': redirect('https://github.com/acme/motion'),
  'https://t.co/site': redirect('https://motion.example/'),
  'https://t.co/docs': redirect('https://www.motion.example/docs/spring?utm_source=x'),
  'https://t.co/tree': redirect('https://github.com/acme/motion/tree/main/docs'),
  'https://github.com/acme/motion': page('GitHub - acme/motion: Animation library', 'Springs for React'),
  'https://github.com/acme/motion/tree/main/docs': page('motion/docs at main', 'Springs for React'),
  'https://motion.example/': page('Motion', 'A React animation library'),
  'https://www.motion.example/docs/spring?utm_source=x': page('Spring - Motion docs'),
};

test('posts linking to a library site and to the repo that declares it as homepage share one resource', async (t) => {
  const { db, run } = setup(t, libraryPosts, {
    ...libraryRoutes,
    [REPO_API]: repoApi({ full_name: 'acme/motion', homepage: 'https://motion.example', description: 'Springs' }),
  });

  await run();

  assert.deepEqual(groups(db), { 'github:acme/motion': ['1', '2', '3', '4'] });
  const resource = db.prepare('SELECT kind, url, host FROM resources').get();
  assert.deepEqual({ ...resource }, { kind: 'repo', url: 'https://github.com/acme/motion', host: 'github.com' });
});

test('a short link that redirects twice stores the last URL with that page title and description', async (t) => {
  const { db, run } = setup(t, [{ id: '1', urls: ['https://t.co/a'] }], {
    'https://t.co/a': redirect('https://short.example/x'),
    'https://short.example/x': redirect('https://blog.example/posts/hello'),
    'https://blog.example/posts/hello': page('Hello world', 'A first post'),
  });

  const counts = await run();

  const row = link(db, 'https://t.co/a');
  assert.equal(row.status, 'resolved');
  assert.equal(row.final_url, 'https://blog.example/posts/hello');
  assert.equal(row.host, 'blog.example');
  assert.equal(row.title, 'Hello world');
  assert.equal(row.description, 'A first post');
  assert.equal(row.resolved_at, '2026-06-01T00:00:00.000Z');
  assert.equal(counts.resolved, 1);
  assert.deepEqual(groups(db), { 'blog.example/posts/hello': ['1'] });
});

test('a relative redirect is followed from the page that sent it', async (t) => {
  const { db, run } = setup(t, [{ id: '1', urls: ['https://t.co/a'] }], {
    'https://t.co/a': redirect('https://blog.example/old'),
    'https://blog.example/old': redirect('/new'),
    'https://blog.example/new': page('New home'),
  });

  await run();

  assert.equal(link(db, 'https://t.co/a').final_url, 'https://blog.example/new');
});

test('a link whose export entry already names its destination starts there', async (t) => {
  const { db, web, run } = setup(
    t,
    [{ id: '1', urls: [{ url: 'https://t.co/a', expandedUrl: 'https://blog.example/posts/hello' }] }],
    { 'https://blog.example/posts/hello': page('Hello world') },
  );

  await run();

  assert.deepEqual(web.calls, ['https://blog.example/posts/hello']);
  assert.equal(link(db, 'https://t.co/a').title, 'Hello world');
});

test('a link that ends on x.com is not a resource and its page is never fetched', async (t) => {
  const { db, web, run } = setup(t, [{ id: '1', urls: ['https://t.co/a'] }], {
    'https://t.co/a': redirect('https://x.com/someone/status/123/photo/1'),
  });

  const counts = await run();

  const row = link(db, 'https://t.co/a');
  assert.equal(row.status, 'not_resource');
  assert.equal(row.final_url, 'https://x.com/someone/status/123/photo/1');
  assert.equal(row.resource_id, null);
  assert.deepEqual(web.calls, ['https://t.co/a']);
  assert.deepEqual(groups(db), {});
  assert.equal(counts.notResource, 1);

  await run();
  assert.deepEqual(web.calls, ['https://t.co/a']);
});

test('a link straight to a twitter.com subdomain makes no request at all', async (t) => {
  const { db, web, run } = setup(t, [{ id: '1', urls: ['https://mobile.twitter.com/someone/status/1'] }]);

  await run();

  assert.equal(link(db, 'https://mobile.twitter.com/someone/status/1').status, 'not_resource');
  assert.deepEqual(web.calls, []);
});

test('a link to an image file is not a resource', async (t) => {
  const image = 'https://pbs.twimg.com/media/abc.jpg';
  const { db, run } = setup(t, [{ id: '1', urls: [image] }], {
    [image]: { status: 200, headers: { 'content-type': 'image/jpeg' }, body: '' },
  });

  await run();

  assert.equal(link(db, image).status, 'not_resource');
  assert.deepEqual(groups(db), {});
});

test('a timeout is a failed attempt, retried only after a growing gap and given up after four', async (t) => {
  const { db, web, run, advance } = setup(t, [{ id: '1', urls: ['https://t.co/a'] }], {
    'https://t.co/a': new Error('The operation was aborted due to timeout'),
  });
  const attempts = () => web.calls.length;

  const first = await run();
  let row = link(db, 'https://t.co/a');
  assert.equal(row.status, 'failed');
  assert.equal(row.attempts, 1);
  assert.match(String(row.last_error), /timeout/);
  assert.equal(first.failed, 1);

  advance(5 * HOUR);
  await run();
  assert.equal(attempts(), 1, 'not retried before the first gap of 6 h');

  advance(1 * HOUR);
  await run();
  assert.equal(attempts(), 2, 'retried once 6 h have passed');

  advance(11 * HOUR);
  await run();
  assert.equal(attempts(), 2, 'the second gap is 12 h');

  advance(1 * HOUR);
  await run();
  assert.equal(attempts(), 3);

  advance(24 * HOUR);
  const last = await run();
  assert.equal(attempts(), 4);
  row = link(db, 'https://t.co/a');
  assert.equal(row.status, 'unresolved');
  assert.equal(row.attempts, 4);
  assert.equal(last.unresolved, 1);

  advance(365 * 24 * HOUR);
  await run();
  assert.equal(attempts(), 4, 'never tried again after four failures');
  assert.deepEqual(groups(db), {});
});

test('a link that failed resolves on a later retry', async (t) => {
  const { db, web, run, advance } = setup(t, [{ id: '1', urls: ['https://t.co/a'] }], {
    'https://t.co/a': redirect('https://blog.example/p'),
    'https://blog.example/p': { status: 503, headers: {}, body: '' },
  });

  await run();
  assert.equal(link(db, 'https://t.co/a').status, 'failed');

  web.set('https://blog.example/p', page('Back up'));
  advance(6 * HOUR);
  await run();

  const row = link(db, 'https://t.co/a');
  assert.equal(row.status, 'resolved');
  assert.equal(row.title, 'Back up');
  assert.equal(row.last_error, null);
});

test('a redirect loop is a failed attempt', async (t) => {
  const { db, run } = setup(t, [{ id: '1', urls: ['https://t.co/a'] }], {
    'https://t.co/a': redirect('https://loop.example/a'),
    'https://loop.example/a': redirect('https://loop.example/b'),
    'https://loop.example/b': redirect('https://loop.example/a'),
  });

  await run();

  assert.equal(link(db, 'https://t.co/a').status, 'failed');
});

test('a page with no title stores the URL host as the title', async (t) => {
  const { db, run } = setup(t, [{ id: '1', urls: ['https://t.co/a'] }], {
    'https://t.co/a': redirect('https://www.tool.example/app'),
    'https://www.tool.example/app': page(null),
  });

  await run();

  const row = link(db, 'https://t.co/a');
  assert.equal(row.status, 'resolved');
  assert.equal(row.title, 'tool.example');
  assert.equal(db.prepare('SELECT title FROM resources').get()?.title, 'tool.example');
});

test('a page titled "Just a moment..." is not stored and the link is retried', async (t) => {
  const { db, web, run, advance } = setup(t, [{ id: '1', urls: ['https://t.co/a'] }], {
    'https://t.co/a': redirect('https://walled.example/article'),
    'https://walled.example/article': page('Just a moment...'),
  });

  await run();
  let row = link(db, 'https://t.co/a');
  assert.equal(row.status, 'failed');
  assert.equal(row.title, null);
  assert.deepEqual(groups(db), {});

  web.set('https://walled.example/article', page('The real article'));
  advance(6 * HOUR);
  await run();
  row = link(db, 'https://t.co/a');
  assert.equal(row.status, 'resolved');
  assert.equal(row.title, 'The real article');
});

test('a login page title is treated the same as a bot wall', async (t) => {
  const { db, run } = setup(t, [{ id: '1', urls: ['https://t.co/a'] }], {
    'https://t.co/a': redirect('https://members.example/post/1'),
    'https://members.example/post/1': page('Sign in to continue'),
  });

  await run();

  assert.equal(link(db, 'https://t.co/a').status, 'failed');
});

test('an article about CAPTCHAs is not mistaken for a bot wall', async (t) => {
  const { db, run } = setup(t, [{ id: '1', urls: ['https://t.co/a'] }], {
    'https://t.co/a': redirect('https://blog.example/captcha'),
    'https://blog.example/captcha': page('How we replaced our CAPTCHA'),
  });

  await run();

  assert.equal(link(db, 'https://t.co/a').status, 'resolved');
});

test('a repo GitHub does not know is not asked about again, and one failed lookup does not stop the next', async (t) => {
  const { db, web, run } = setup(
    t,
    [{ id: '1', urls: ['https://github.com/acme/broken', 'https://github.com/acme/gone', 'https://github.com/acme/motion'] }],
    {
      'https://github.com/acme/broken': page('broken'),
      'https://github.com/acme/gone': page('gone'),
      'https://github.com/acme/motion': page('motion'),
      'https://api.github.com/repos/acme/broken': { status: 500, headers: {}, body: '' },
      'https://api.github.com/repos/acme/gone': { status: 404, headers: {}, body: '' },
      [REPO_API]: repoApi({ full_name: 'acme/motion', homepage: 'https://motion.example' }),
    },
  );
  const status = () =>
    Object.fromEntries(
      db.prepare('SELECT canonical_key, homepage_status FROM resources').all().map((r) => [r.canonical_key, r.homepage_status]),
    );

  await run();
  assert.deepEqual(status(), {
    'github:acme/broken': 'pending',
    'github:acme/gone': 'not_found',
    'github:acme/motion': 'ok',
  });

  web.calls.length = 0;
  await run();
  assert.deepEqual(web.calls, ['https://api.github.com/repos/acme/broken']);
});

test('a refusal from GitHub that is not a rate limit does not stop the other lookups', async (t) => {
  const { db, run } = setup(
    t,
    [{ id: '1', urls: ['https://github.com/acme/blocked', 'https://github.com/acme/motion'] }],
    {
      'https://github.com/acme/blocked': page('blocked'),
      'https://github.com/acme/motion': page('motion'),
      'https://api.github.com/repos/acme/blocked': { status: 403, headers: {}, body: '{"message":"Repository access blocked"}' },
      [REPO_API]: repoApi({ full_name: 'acme/motion', homepage: null }),
    },
  );

  await run();

  assert.equal(
    db.prepare(`SELECT homepage_status FROM resources WHERE canonical_key = 'github:acme/motion'`).get()?.homepage_status,
    'ok',
  );
});

test('page metadata is stored as plain capped text, preferring the sharing title', async (t) => {
  const body = `<html><head>
    <title>ignored &amp; plain</title>
    <meta property="og:title" content="The &lt;dialog&gt;  element &amp; &#39;friends&#39;\u0007">
    <meta content="${'d'.repeat(5000)}" property="og:description">
    </head></html>`;
  const { db, run } = setup(t, [{ id: '1', urls: ['https://t.co/a'] }], {
    'https://t.co/a': redirect('https://lib.example/'),
    'https://lib.example/': { status: 200, headers: { 'content-type': 'text/html' }, body },
  });

  await run();

  const row = link(db, 'https://t.co/a');
  assert.equal(row.title, "The <dialog> element & 'friends'");
  assert.ok(String(row.description).length <= 1000);
  assert.match(String(row.description), /^d+…?$/);
});

test('a link to a local or private address is never requested', async (t) => {
  const { db, web, run } = setup(t, [
    { id: '1', urls: ['http://localhost:8080/admin', 'http://192.168.1.1/reboot'] },
  ]);

  await run();

  assert.deepEqual(web.calls, []);
  assert.equal(link(db, 'http://localhost:8080/admin').status, 'failed');
  assert.deepEqual(groups(db), {});
});

test('a GitHub rate-limit response leaves the alias pending without failing, and a later run fills it in', async (t) => {
  const { db, web, run } = setup(t, libraryPosts, { ...libraryRoutes, [REPO_API]: rateLimited });

  const first = await run();

  assert.deepEqual(groups(db), { 'github:acme/motion': ['1', '4'], 'motion.example': ['2'], 'motion.example/docs/spring': ['3'] });
  assert.equal(db.prepare(`SELECT homepage_status FROM resources WHERE kind = 'repo'`).get()?.homepage_status, 'pending');
  assert.equal(first.homepagesPending, 1);

  web.set(REPO_API, repoApi({ full_name: 'acme/motion', homepage: 'https://motion.example/', description: null }));
  const second = await run();

  assert.deepEqual(groups(db), { 'github:acme/motion': ['1', '2', '3', '4'] });
  assert.equal(second.homepagesPending, 0);
  assert.equal(second.aliases, 1);
});

test('homepage lookups stop for the run at the first rate-limit response', async (t) => {
  const { web, run } = setup(
    t,
    [{ id: '1', urls: ['https://github.com/acme/one', 'https://github.com/acme/two'] }],
    {
      'https://github.com/acme/one': page('one'),
      'https://github.com/acme/two': page('two'),
      'https://api.github.com/repos/acme/one': rateLimited,
      'https://api.github.com/repos/acme/two': rateLimited,
    },
  );

  const counts = await run();

  assert.equal(web.calls.filter((url) => url.startsWith('https://api.github.com/')).length, 1);
  assert.equal(counts.homepagesPending, 2);
});

test('a host declared as homepage by two repos is aliased to neither, even if one was aliased before', async (t) => {
  const { db, run, add } = setup(
    t,
    [
      { id: '1', urls: ['https://github.com/acme/motion'] },
      { id: '2', urls: ['https://acme.example/guide'] },
    ],
    {
      'https://github.com/acme/motion': page('motion'),
      'https://github.com/acme/other': page('other'),
      'https://acme.example/guide': page('Guide'),
      [REPO_API]: repoApi({ full_name: 'acme/motion', homepage: 'https://acme.example' }),
      'https://api.github.com/repos/acme/other': repoApi({ full_name: 'acme/other', homepage: 'https://acme.example/' }),
    },
  );

  await run();
  assert.deepEqual(groups(db), { 'github:acme/motion': ['1', '2'] });

  add([{ id: '3', urls: ['https://github.com/acme/other'] }]);
  const counts = await run();

  assert.deepEqual(groups(db), {
    'acme.example/guide': ['2'],
    'github:acme/motion': ['1'],
    'github:acme/other': ['3'],
  });
  assert.equal(counts.aliases, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM resource_aliases').get()?.n, 0);
});

test('a link on a shared host keeps its own host-and-path key', async (t) => {
  const { db, run } = setup(
    t,
    [
      { id: '1', urls: ['https://github.com/acme/motion'] },
      { id: '2', urls: ['https://medium.com/@someone/an-unrelated-post'] },
    ],
    {
      'https://github.com/acme/motion': page('motion'),
      'https://medium.com/@someone/an-unrelated-post': page('Unrelated'),
      [REPO_API]: repoApi({ full_name: 'acme/motion', homepage: 'https://medium.com/' }),
    },
  );

  await run();

  assert.deepEqual(groups(db), { 'github:acme/motion': ['1'], 'medium.com/@someone/an-unrelated-post': ['2'] });
});

test('a homepage that is a path on a host does not alias that host', async (t) => {
  const { db, run } = setup(
    t,
    [
      { id: '1', urls: ['https://github.com/acme/motion'] },
      { id: '2', urls: ['https://acme.example/blog/news'] },
    ],
    {
      'https://github.com/acme/motion': page('motion'),
      'https://acme.example/blog/news': page('News'),
      [REPO_API]: repoApi({ full_name: 'acme/motion', homepage: 'https://acme.example/motion' }),
    },
  );

  await run();

  assert.deepEqual(groups(db), { 'acme.example/blog/news': ['2'], 'github:acme/motion': ['1'] });
});

test('a repo resource is described by the repo, whichever of its links resolved', async (t) => {
  const { db, run } = setup(t, [{ id: '1', urls: ['https://github.com/acme/motion/issues/7'] }], {
    'https://github.com/acme/motion/issues/7': page('Crash on mount · Issue #7', 'It crashes'),
    [REPO_API]: repoApi({ full_name: 'Acme/Motion', homepage: '', description: 'Springs for React' }),
  });

  await run();

  const resource = db.prepare('SELECT title, description, homepage_status, homepage_url FROM resources').get();
  assert.deepEqual({ ...resource }, {
    title: 'Acme/Motion',
    description: 'Springs for React',
    homepage_status: 'ok',
    homepage_url: null,
  });
});

test('a post with no links produces no resource rows and no requests', async (t) => {
  const { db, web, run } = setup(t, [{ id: '1', urls: [] }]);

  const counts = await run();

  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM resources').get()?.n, 0);
  assert.deepEqual(web.calls, []);
  assert.equal(counts.attempted, 0);
});

test('a second run makes no requests and changes nothing', async (t) => {
  const { db, web, run } = setup(t, libraryPosts, {
    ...libraryRoutes,
    [REPO_API]: repoApi({ full_name: 'acme/motion', homepage: 'https://motion.example', description: 'Springs' }),
  });
  await run();
  const callsAfterFirst = web.calls.length;
  const before = db.prepare('SELECT total_changes() AS n').get()?.n;

  const counts = await run();

  assert.equal(web.calls.length, callsAfterFirst);
  assert.equal(db.prepare('SELECT total_changes() AS n').get()?.n, before);
  assert.equal(counts.attempted, 0);
  assert.equal(counts.resources, 1);
});
