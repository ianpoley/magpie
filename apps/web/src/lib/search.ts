import type { Post, Range } from "./types.ts";

const escape = (word: string): string => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const words = (query: string): string[] => query.trim().split(/\s+/).filter(Boolean);

// Longest first, so where one word contains another the whole of it is marked.
export function highlightRanges(text: string, query: string): Range[] {
  const terms = words(query).sort((a, b) => b.length - a.length);
  if (terms.length === 0) return [];
  const pattern = new RegExp(terms.map(escape).join("|"), "gi");
  return Array.from(text.matchAll(pattern), (match): Range => [match.index, match.index + match[0].length]);
}

/**
 * Whether every word of the query occurs somewhere in the post: its text, its
 * quoted post's text, the author's name or handle, or the title of a page it
 * links to. The words need not be next to each other or in the same place. A
 * blank query matches every post.
 */
export function matchesKeyword(post: Post, query: string): boolean {
  const fields = [post.text, post.authorName, post.authorHandle, post.quoted?.text ?? "", ...post.linkedPages.map((page) => page.title)];
  return words(query).every((word) => {
    const pattern = new RegExp(escape(word), "i");
    return fields.some((field) => pattern.test(field));
  });
}
