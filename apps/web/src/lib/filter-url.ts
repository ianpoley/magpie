import { DEFAULT_FILTER } from "./filter.ts";
import type { Collection, FilterState, Sort, TimeRange } from "./types.ts";

export type CategorySelection = Pick<FilterState, "topicIds" | "areaIds" | "unfiled">;

export type QueryValues = Record<string, string | string[] | undefined>;

const MAX_IDS = 50;
const MAX_VALUE_LENGTH = 1000;
const ID = /^[1-9]\d{0,14}$/;

const ascending = (ids: number[]): number[] => [...new Set(ids)].sort((a, b) => a - b);

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

export function parseSelection(query: QueryValues): CategorySelection {
  if (first(query.unfiled) === "1") return { topicIds: [], areaIds: [], unfiled: true };
  return { topicIds: ids(query.topics), areaIds: ids(query.areas), unfiled: false };
}

export type LinkedFilter = CategorySelection & Pick<FilterState, "collection" | "author" | "keyword" | "timeRange" | "sort" | "mediaOnly">;

const LINKED_COLLECTIONS: readonly Collection[] = ["bookmarks", "likes"];
const LINKED_TIME_RANGES: readonly TimeRange[] = ["week", "month", "year"];
const LINKED_SORTS: readonly Sort[] = ["newest", "oldest", "most_liked"];

const HANDLE = /^[A-Za-z0-9_]{1,15}$/;
const MAX_KEYWORD_LENGTH = 200;

const linkedKeyword = (keyword: string): string => [...keyword.trim()].slice(0, MAX_KEYWORD_LENGTH).join("").trimEnd();

export function linkedQuery(filter: LinkedFilter): string {
  const keyword = linkedKeyword(filter.keyword);
  return [
    filter.collection === "everything" ? "" : `collection=${filter.collection}`,
    selectionQuery(filter),
    filter.author === null ? "" : `author=${filter.author}`,
    filter.timeRange === "all" ? "" : `time=${filter.timeRange}`,
    filter.sort === DEFAULT_FILTER.sort ? "" : `sort=${filter.sort}`,
    filter.mediaOnly ? "media=1" : "",
    keyword === "" ? "" : `q=${encodeURIComponent(keyword)}`,
  ]
    .filter(Boolean)
    .join("&");
}

export function parseLinked(query: QueryValues): LinkedFilter {
  const author = first(query.author);
  const collection = LINKED_COLLECTIONS.find((name) => name === first(query.collection)) ?? "everything";
  return {
    collection,
    ...parseSelection(query),
    author: HANDLE.test(author) ? author : null,
    keyword: linkedKeyword(first(query.q)),
    timeRange: LINKED_TIME_RANGES.find((range) => range === first(query.time)) ?? "all",
    sort: LINKED_SORTS.find((sort) => sort === first(query.sort)) ?? DEFAULT_FILTER.sort,
    mediaOnly: first(query.media) === "1",
  };
}

export type LinkedView = "posts" | "resources";

export const withView = (query: string, view: LinkedView): string => [view === "resources" ? "view=resources" : "", query].filter(Boolean).join("&");

export const parseView = (query: QueryValues): LinkedView => (first(query.view) === "resources" ? "resources" : "posts");
