import type { FilterState } from "./types.ts";

/** The part of a filter that a link carries. */
export type CategorySelection = Pick<FilterState, "topicIds" | "areaIds" | "unfiled">;

/** Query parameters as a page receives them: a repeated key arrives as a list. */
export type QueryValues = Record<string, string | string[] | undefined>;

const MAX_IDS = 50;
const MAX_VALUE_LENGTH = 1000;
const ID = /^[1-9]\d{0,14}$/;

const ascending = (ids: number[]): number[] => [...new Set(ids)].sort((a, b) => a - b);

/**
 * The selection as a query string without the leading "?", empty when nothing
 * is selected. The same selection always gives the same string.
 */
export function selectionQuery(selection: CategorySelection): string {
  if (selection.unfiled) return "unfiled=1";
  const parts: string[] = [];
  if (selection.topicIds.length > 0) parts.push(`topics=${ascending(selection.topicIds).join(",")}`);
  if (selection.areaIds.length > 0) parts.push(`areas=${ascending(selection.areaIds).join(",")}`);
  return parts.join("&");
}

const first = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] : value) ?? "";

function ids(value: string | string[] | undefined): number[] {
  const text = first(value);
  if (text.length > MAX_VALUE_LENGTH) return [];
  const found = new Set<number>();
  for (const part of text.split(",")) {
    if (ID.test(part)) found.add(Number(part));
    if (found.size === MAX_IDS) break;
  }
  return [...found];
}

/** The selection a URL names. Anything that is not a list of ids is ignored, never an error. */
export function parseSelection(query: QueryValues): CategorySelection {
  if (first(query.unfiled) === "1") return { topicIds: [], areaIds: [], unfiled: true };
  return { topicIds: ids(query.topics), areaIds: ids(query.areas), unfiled: false };
}

/** The selection plus the author and search words, which a link also carries. */
export type LinkedFilter = CategorySelection & Pick<FilterState, "author" | "keyword">;

const HANDLE = /^[A-Za-z0-9_]{1,15}$/;
const MAX_KEYWORD_LENGTH = 200;

/** The filter as a query string without the leading "?": the category selection, then the author, then the search. */
export function linkedQuery(filter: LinkedFilter): string {
  const keyword = filter.keyword.trim();
  return [
    selectionQuery(filter),
    filter.author === null ? "" : `author=${filter.author}`,
    keyword === "" ? "" : `q=${encodeURIComponent(keyword)}`,
  ]
    .filter(Boolean)
    .join("&");
}

/** The selection, author and search a URL names. An author that is not an X handle is ignored. */
export function parseLinked(query: QueryValues): LinkedFilter {
  const author = first(query.author);
  return {
    ...parseSelection(query),
    author: HANDLE.test(author) ? author : null,
    keyword: first(query.q).trim().slice(0, MAX_KEYWORD_LENGTH),
  };
}
