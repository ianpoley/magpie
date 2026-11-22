import assert from "node:assert/strict";
import { test } from "node:test";

import { displayUrl, expandLinks, postAddress, shortenUrls, trimUrl, usableTarget, withoutTracking } from "../src/lib/post-links.ts";

const targets = new Map([
  ["https://t.co/repo", "https://github.com/firecrawl/firecrawl"],
  ["https://t.co/pic", "https://twitter.com/someone/status/42/photo/1"],
  ["https://t.co/other", "https://x.com/else/status/7/video/1"],
  ["https://claude.⁠dev/blog", "https://claude.dev/blog"],
]);

test("a shortened address becomes where it leads, keeping the punctuation after it", () => {
  assert.equal(expandLinks("see https://t.co/repo.", "42", targets), "see https://github.com/firecrawl/firecrawl.");
  assert.equal(expandLinks("(https://t.co/repo)", "42", targets), "(https://github.com/firecrawl/firecrawl)");
});

test("a link to the post's own picture is dropped, one to another post's media is kept", () => {
  assert.equal(expandLinks("look https://t.co/repo https://t.co/pic", "42", targets), "look https://github.com/firecrawl/firecrawl");
  assert.equal(expandLinks("look https://t.co/other", "42", targets), "look https://x.com/else/status/7/video/1");
  assert.equal(expandLinks("look https://t.co/pic", "43", targets), "look https://twitter.com/someone/status/42/photo/1");
});

test("an address split by X's invisible joiners is replaced by the working one", () => {
  assert.equal(expandLinks("read https://claude.⁠dev/blog", "1", targets), "read https://claude.dev/blog");
});

test("addresses with no resolved target, and text with none, are left alone", () => {
  assert.equal(expandLinks("x https://t.co/unknown y", "42", targets), "x https://t.co/unknown y");
  assert.equal(expandLinks("plain  text ", "42", targets), "plain  text ");
});

test("addresses read without scheme or www, and long ones are cut short", () => {
  assert.equal(displayUrl("https://www.example.com/"), "example.com");
  assert.equal(displayUrl("https://github.com/firecrawl/firecrawl"), "github.com/firecrawl/firecrawl");
  assert.equal(displayUrl("https://platform.claude.com/cookbook/managed-agents-cma-dreaming"), "platform.claude.com/cookbook/manage…");
  assert.equal(shortenUrls("a https://www.example.com/x, b"), "a example.com/x, b");
  assert.equal(displayUrl("https://x.com/i/article/2106452411397165056"), "X article");
  assert.equal(displayUrl("https://twitter.com/i/article/2106452411397165056/"), "X article");
  assert.equal(displayUrl("https://x.com/i/article/2106452411397165056/media"), "x.com/i/article/2106452411397165056…");
});

test("only http(s) targets without spaces are used", () => {
  assert.equal(usableTarget("https://ok.example/a"), true);
  assert.equal(usableTarget("javascript:alert(1)"), false);
  assert.equal(usableTarget("https://bad.example/a b"), false);
  assert.equal(usableTarget(null), false);
});

test("a link to the post it quotes is dropped, like X does, but a link to another post stays", () => {
  const quoting = new Map([
    ["https://t.co/q", "https://x.com/someone/status/77"],
    ["https://t.co/o", "https://x.com/someone/status/88"],
  ]);
  assert.equal(expandLinks("so true https://t.co/q", "42", quoting, "77"), "so true");
  assert.equal(expandLinks("see https://t.co/o", "42", quoting, "77"), "see https://x.com/someone/status/88");
});

test("tracking parameters are taken off an address, and nothing else is", () => {
  assert.equal(withoutTracking("https://blog.example.com/post/?utm_source=twitter&utm_medium=social"), "https://blog.example.com/post/");
  assert.equal(withoutTracking("https://example.com/a?id=4&utm_campaign=x"), "https://example.com/a?id=4");
  assert.equal(withoutTracking("https://example.com/a?id=4"), "https://example.com/a?id=4");
  assert.equal(withoutTracking("not a url"), "not a url");
});

test("a closing bracket that belongs to the address is kept, and one that closes the sentence is dropped", () => {
  const mercury = "https://en.wikipedia.org/wiki/Mercury_(planet)";
  assert.equal(trimUrl(mercury), mercury);
  assert.equal(trimUrl(`${mercury}.`), mercury);
  assert.equal(trimUrl(`${mercury}).`), mercury);
  assert.equal(trimUrl("https://example.com/a[1]"), "https://example.com/a[1]");
  assert.equal(trimUrl("https://example.com/a]),"), "https://example.com/a");
});

test("a post opens at its own http(s) address, and anything else falls back to its address on X", () => {
  assert.equal(postAddress("https://x.com/ada/status/1", "ada", "1"), "https://x.com/ada/status/1");
  assert.equal(postAddress("javascript:alert(1)", "ada", "42"), "https://x.com/ada/status/42");
  assert.equal(postAddress("", "a/b", "4?2"), "https://x.com/a%2Fb/status/4%3F2");
});
