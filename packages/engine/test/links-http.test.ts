import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import type { TestContext } from 'node:test';

import { fetchHttp } from '../src/links/http.ts';

async function serve(t: TestContext, handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<string> {
  const server = createServer(handler);
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

test('a redirect is returned with its location, not followed', async (t) => {
  let requests = 0;
  const base = await serve(t, (req, res) => {
    requests++;
    if (req.url === '/start') res.writeHead(302, { Location: '/next' }).end();
    else res.writeHead(200, { 'Content-Type': 'text/html' }).end('<title>next</title>');
  });

  const response = await fetchHttp({ url: `${base}/start`, timeoutMs: 2000, maxBytes: 1000 });

  assert.equal(response.status, 302);
  assert.equal(response.headers.location, '/next');
  assert.equal(requests, 1);
});

test('an HTML body is returned up to the byte cap', async (t) => {
  const base = await serve(t, (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(`<title>café</title>${'x'.repeat(50_000)}`);
  });

  const response = await fetchHttp({ url: `${base}/`, timeoutMs: 2000, maxBytes: 4096 });

  assert.equal(response.status, 200);
  assert.match(response.headers['content-type'], /^text\/html/);
  assert.ok(response.body.startsWith('<title>café</title>'));
  assert.equal(Buffer.byteLength(response.body), 4096);
});

test('the body of a response that is not text is not read', async (t) => {
  const base = await serve(t, (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'image/png' }).end(Buffer.alloc(2000, 1));
  });

  const response = await fetchHttp({ url: `${base}/pic.png`, timeoutMs: 2000, maxBytes: 4096 });

  assert.equal(response.headers['content-type'], 'image/png');
  assert.equal(response.body, '');
});

test('a server that does not answer in time rejects', async (t) => {
  const base = await serve(t, () => {});

  await assert.rejects(fetchHttp({ url: `${base}/`, timeoutMs: 100, maxBytes: 1000 }), /timeout|aborted/i);
});

test('request headers given by the caller are sent', async (t) => {
  const base = await serve(t, (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ accept: req.headers.accept }));
  });

  const response = await fetchHttp({
    url: `${base}/`,
    timeoutMs: 2000,
    maxBytes: 1000,
    headers: { accept: 'application/vnd.github+json' },
  });

  assert.deepEqual(JSON.parse(response.body), { accept: 'application/vnd.github+json' });
});
