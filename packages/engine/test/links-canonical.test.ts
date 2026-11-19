import assert from 'node:assert/strict';
import { test } from 'node:test';

import { canonicalize } from '../src/links/canonical.ts';

const key = (url: string) => canonicalize(url)?.key;

test('a repo, a path inside it and its readme anchor share one key', () => {
  assert.equal(key('https://github.com/o/r'), 'github:o/r');
  assert.equal(key('https://github.com/o/r/tree/main/docs'), 'github:o/r');
  assert.equal(key('https://github.com/o/r#readme'), 'github:o/r');
});

test('a repo key ignores letter case, www and a .git suffix', () => {
  assert.equal(key('https://www.github.com/Vercel/Next.js.git'), 'github:vercel/next.js');
  assert.equal(key('http://github.com/vercel/next.js/'), 'github:vercel/next.js');
});

test('a repo is a repo resource opened at its root', () => {
  assert.deepEqual(canonicalize('https://github.com/o/r/issues/12?utm_source=x'), {
    key: 'github:o/r',
    kind: 'repo',
    url: 'https://github.com/o/r',
    host: 'github.com',
  });
});

test('GitHub pages that are not a repo keep a host-and-path key', () => {
  assert.equal(key('https://github.com/someone'), 'github.com/someone');
  assert.equal(key('https://github.com/orgs/acme/people'), 'github.com/orgs/acme/people');
  assert.equal(key('https://github.com/features/copilot'), 'github.com/features/copilot');
  assert.equal(canonicalize('https://github.com/sponsors/someone')?.kind, 'page');
});

test('URLs differing only by utm parameters, www and a trailing slash share one key', () => {
  const plain = key('https://example.com/blog/post');
  assert.equal(plain, 'example.com/blog/post');
  assert.equal(key('https://www.example.com/blog/post/?utm_source=x&utm_medium=social'), plain);
  assert.equal(key('http://example.com/blog/post#section-2'), plain);
});

test('a site root has the bare host as its key', () => {
  assert.equal(key('https://www.Example.com/'), 'example.com');
  assert.equal(key('https://example.com'), 'example.com');
});

test('query parameters that select the page are kept, in a stable order', () => {
  assert.equal(key('https://news.example.com/item?id=1'), 'news.example.com/item?id=1');
  assert.notEqual(key('https://news.example.com/item?id=1'), key('https://news.example.com/item?id=2'));
  assert.equal(
    key('https://example.com/search?q=cats&page=2&fbclid=abc'),
    key('https://example.com/search?page=2&q=cats'),
  );
});

test('an npm package page reduces to the package name', () => {
  assert.equal(key('https://www.npmjs.com/package/motion'), 'npm:motion');
  assert.equal(key('https://www.npmjs.com/package/motion/v/11.0.0'), 'npm:motion');
  assert.equal(key('https://npmjs.com/package/@scope/name?activeTab=versions'), 'npm:@scope/name');
  assert.deepEqual(canonicalize('https://www.npmjs.com/package/@scope/name/v/1.2.3'), {
    key: 'npm:@scope/name',
    kind: 'package',
    url: 'https://www.npmjs.com/package/@scope/name',
    host: 'npmjs.com',
  });
});

test('every address of a YouTube video reduces to its id', () => {
  assert.equal(key('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s'), 'youtube:dQw4w9WgXcQ');
  assert.equal(key('https://youtu.be/dQw4w9WgXcQ?si=abc'), 'youtube:dQw4w9WgXcQ');
  assert.equal(key('https://m.youtube.com/shorts/dQw4w9WgXcQ'), 'youtube:dQw4w9WgXcQ');
  assert.equal(key('https://www.youtube.com/live/dQw4w9WgXcQ'), 'youtube:dQw4w9WgXcQ');
  assert.equal(canonicalize('https://youtu.be/dQw4w9WgXcQ')?.kind, 'video');
});

test('a YouTube page that is not a video keeps a host-and-path key', () => {
  assert.equal(key('https://www.youtube.com/@somechannel'), 'youtube.com/@somechannel');
});

test('an address that is not a web page has no key', () => {
  assert.equal(canonicalize('mailto:someone@example.com'), null);
  assert.equal(canonicalize('not a url'), null);
});
