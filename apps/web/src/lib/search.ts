import { X_URL } from "./post-links.ts";
import type { Post, Range } from "./types.ts";

const escape = (word: string): string => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const TERM = /["“”]([^"“”]+)["“”]|(\S+)/g;

const words = (query: string): string[] =>
  Array.from(query.matchAll(TERM), (match) => (match[1] ?? match[2]).trim().replace(/^["“”]+|["“”]+$/g, "")).filter(Boolean);

export function highlightRanges(text: string, query: string, phrase = false): Range[] {
  const terms = phrase ? [query.trim()].filter(Boolean) : words(query).sort((a, b) => b.length - a.length);
  if (terms.length === 0) return [];
  const pattern = new RegExp(terms.map(escape).join("|"), "gi");
  return Array.from(text.matchAll(pattern), (match): Range => [match.index, match.index + match[0].length]);
}

export function aroundHit(text: string, query: string, after: number, lead = 48): string {
  const first = highlightRanges(text, query)[0];
  if (!first || first[0] < after) return text;
  const space = text.lastIndexOf(" ", first[0] - lead);
  return `…${text.slice(space < 0 ? Math.max(0, first[0] - lead) : space + 1)}`;
}

export function matchesKeyword(post: Post, query: string): boolean {
  const fields = [post.text.replace(X_URL, ""), post.authorName, post.authorHandle, post.quoted?.text ?? "", ...post.linkedPages.map((page) => page.title)];
  return words(query).every((word) => {
    const pattern = new RegExp(escape(word), "i");
    return fields.some((field) => pattern.test(field));
  });
}
