import type { Post, Range } from "./types.ts";

function matcher(query: string, flags: string): RegExp | null {
  const needle = query.trim();
  if (!needle) return null;
  return new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);
}

/** Where `query` occurs in `text`, ignoring case, as ranges into `text` itself. */
export function highlightRanges(text: string, query: string): Range[] {
  const pattern = matcher(query, "gi");
  if (!pattern) return [];
  return Array.from(text.matchAll(pattern), (match): Range => [match.index, match.index + match[0].length]);
}

/**
 * Whether the query occurs in the post's text, its quoted post's text, the
 * author's name or handle, or the title of a page it links to. A blank query
 * matches every post.
 */
export function matchesKeyword(post: Post, query: string): boolean {
  const pattern = matcher(query, "i");
  if (!pattern) return true;
  return (
    pattern.test(post.text) ||
    pattern.test(post.authorName) ||
    pattern.test(post.authorHandle) ||
    (post.quoted !== null && pattern.test(post.quoted.text)) ||
    post.linkTitles.some((title) => pattern.test(title))
  );
}
