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

const searchTexts = new WeakMap<Post, string>();

export function searchText(post: Post): string {
  let text = searchTexts.get(post);
  if (text === undefined) {
    const fields = [post.text.replace(X_URL, ""), post.authorName, post.authorHandle, (post.quoted?.text ?? "").replace(X_URL, ""), ...post.linkedPages.map((page) => page.title)];
    text = fields.join("\n").toLowerCase();
    searchTexts.set(post, text);
  }
  return text;
}

export const keywordTerms = (query: string): string[] => words(query).map((word) => word.toLowerCase());

export function keywordMatcher(query: string): (post: Post) => boolean {
  const terms = keywordTerms(query);
  if (terms.length === 0) return () => true;
  return (post) => {
    const text = searchText(post);
    return terms.every((term) => text.includes(term));
  };
}

export const matchesKeyword = (post: Post, query: string): boolean => keywordMatcher(query)(post);

export const narrows = (before: string[], after: string[]): boolean =>
  after.length >= before.length && before.every((term, index) => after[index].includes(term));
