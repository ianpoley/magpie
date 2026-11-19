import { X_URL } from "./post-links.ts";
import type { Post, Range } from "./types.ts";

const escape = (word: string): string => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const TERM = /["“”]([^"“”]+)["“”]|(\S+)/g;

/** The query's words, keeping a phrase in quotes together. */
const words = (query: string): string[] =>
  Array.from(query.matchAll(TERM), (match) => (match[1] ?? match[2]).trim().replace(/^["“”]+|["“”]+$/g, "")).filter(Boolean);

// Longest first, so where one word contains another the whole of it is marked.
export function highlightRanges(text: string, query: string): Range[] {
  const terms = words(query).sort((a, b) => b.length - a.length);
  if (terms.length === 0) return [];
  const pattern = new RegExp(terms.map(escape).join("|"), "gi");
  return Array.from(text.matchAll(pattern), (match): Range => [match.index, match.index + match[0].length]);
}

/**
 * Whether every word of the query, and every phrase in quotes, occurs
 * somewhere in the post: its text, its quoted post's text, the author's name
 * or handle, or the title of a page it links to. Separate words need not be
 * next to each other or in the same place. Addresses on X itself are left out,
 * so words like "status" match what a post says, not its links to other posts.
 * A blank query matches every post.
 */
export function matchesKeyword(post: Post, query: string): boolean {
  const fields = [post.text.replace(X_URL, ""), post.authorName, post.authorHandle, post.quoted?.text ?? "", ...post.linkedPages.map((page) => page.title)];
  return words(query).every((word) => {
    const pattern = new RegExp(escape(word), "i");
    return fields.some((field) => pattern.test(field));
  });
}
