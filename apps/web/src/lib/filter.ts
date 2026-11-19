import { matchesKeyword } from "./search.ts";
import type { AuthorCount, Band, Chip, FilterResult, FilterState, Post, Snapshot, Stats, TimeRange } from "./types.ts";

export const DEFAULT_FILTER: FilterState = {
  collection: "everything",
  topicIds: [],
  areaIds: [],
  unfiled: false,
  author: null,
  keyword: "",
  timeRange: "all",
  sort: "newest",
  mediaOnly: false,
  revealHidden: false,
};

export const MOST_SAVED_AUTHORS = 10;

const DAY_MS = 24 * 60 * 60 * 1000;
const RANGE_DAYS: Record<Exclude<TimeRange, "all">, number> = { week: 7, month: 30, year: 365 };

const sameHandle = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

const newestFirst = (a: Post, b: Post): number =>
  (b.createdAtMs ?? -Infinity) - (a.createdAtMs ?? -Infinity) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const ORDER: Record<FilterState["sort"], (a: Post, b: Post) => number> = {
  newest: newestFirst,
  oldest: (a, b) => (a.createdAtMs ?? Infinity) - (b.createdAtMs ?? Infinity) || newestFirst(a, b),
  most_liked: (a, b) => b.likeCount - a.likeCount || newestFirst(a, b),
};

/**
 * The posts a filter shows, in display order.
 *
 * Several topics narrow to posts in all of them; an area stands for any topic
 * inside it, and an area selected with one of its own topics reduces to the
 * topic. Unsure matches count, and rank after posts confident in every
 * selected item whatever the sort. Unfiled replaces any topic or area
 * selection. Hidden posts are left out unless everything is revealed or the
 * selection itself names a hidden topic or area.
 */
export function applyFilter(snapshot: Snapshot, state: FilterState, now: number): FilterResult {
  const topicsById = new Map(snapshot.topics.map((topic) => [topic.id, topic]));
  const areasById = new Map(snapshot.areas.map((area) => [area.id, area]));

  const dropped = {
    topicIds: state.topicIds.filter((id) => !topicsById.has(id)),
    areaIds: state.areaIds.filter((id) => !areasById.has(id)),
  };
  const topicIds = state.unfiled ? [] : [...new Set(state.topicIds.filter((id) => topicsById.has(id)))];
  const topicAreas = new Set(topicIds.map((id) => topicsById.get(id)?.areaId));
  const areaIds = state.unfiled
    ? []
    : [...new Set(state.areaIds.filter((id) => areasById.has(id) && !topicAreas.has(id)))];
  const applied: FilterState = { ...state, topicIds, areaIds };

  const categorySelected = topicIds.length + areaIds.length > 0;
  const showHidden =
    state.revealHidden ||
    topicIds.some((id) => topicsById.get(id)?.hidden) ||
    areaIds.some((id) => areasById.get(id)?.hidden);
  const since = state.timeRange === "all" ? null : now - RANGE_DAYS[state.timeRange] * DAY_MS;
  const author = state.author;

  /** The post's band across the selection, or null when it is outside it. */
  const selectionBand = (post: Post): Band | null => {
    const byTopic = new Map<number, Band>();
    const byArea = new Map<number, Band>();
    for (const { topicId, band } of post.memberships) {
      byTopic.set(topicId, band);
      const areaId = topicsById.get(topicId)?.areaId;
      if (areaId != null && byArea.get(areaId) !== "confident") byArea.set(areaId, band);
    }
    const bands = [...topicIds.map((id) => byTopic.get(id)), ...areaIds.map((id) => byArea.get(id))];
    if (bands.includes(undefined)) return null;
    return bands.every((band) => band === "confident") ? "confident" : "unsure";
  };

  const confident: Post[] = [];
  const unsure: Post[] = [];
  for (const post of snapshot.posts) {
    if (post.hidden && !showHidden) continue;
    if (state.collection === "bookmarks" && !post.bookmarked) continue;
    if (state.collection === "likes" && !post.liked) continue;
    if (state.unfiled && !post.unfiled) continue;
    if (author !== null && !sameHandle(post.authorHandle, author)) continue;
    if (since !== null && (post.createdAtMs === null || post.createdAtMs < since)) continue;
    if (state.mediaOnly && post.media.length === 0) continue;
    if (!matchesKeyword(post, state.keyword)) continue;
    if (!categorySelected) {
      confident.push(post);
      continue;
    }
    const band = selectionBand(post);
    if (band === "confident") confident.push(post);
    else if (band === "unsure") unsure.push(post);
  }

  const order = ORDER[state.sort];
  confident.sort(order);
  unsure.sort(order);
  return {
    state: applied,
    dropped,
    posts: [...confident, ...unsure],
    unsureStart: categorySelected ? confident.length : null,
  };
}

export function stats(posts: Post[]): Stats {
  const authors = new Set<string>();
  let bookmarks = 0;
  let likes = 0;
  for (const post of posts) {
    authors.add(post.authorHandle.toLowerCase());
    if (post.bookmarked) bookmarks++;
    if (post.liked) likes++;
  }
  return { posts: posts.length, bookmarks, likes, authors: authors.size };
}

/** The authors with the most saved posts, leaving hidden posts out unless revealed. */
export function mostSavedAuthors(posts: Post[], revealHidden: boolean, limit: number = MOST_SAVED_AUTHORS): AuthorCount[] {
  const byHandle = new Map<string, AuthorCount>();
  for (const post of posts) {
    if (post.hidden && !revealHidden) continue;
    const key = post.authorHandle.toLowerCase();
    const entry = byHandle.get(key);
    if (entry) entry.count++;
    else {
      byHandle.set(key, {
        handle: post.authorHandle,
        name: post.authorName,
        avatarUrl: post.authorAvatarUrl,
        avatarHue: post.authorAvatarHue,
        count: 1,
      });
    }
  }
  return [...byHandle.values()]
    .sort((a, b) => b.count - a.count || a.handle.localeCompare(b.handle))
    .slice(0, limit);
}

/** A card's chips: its confident topics, then any selected topic it only possibly matches. */
export function postChips(post: Post, state: FilterState): Chip[] {
  return post.memberships
    .filter(({ topicId, band }) => band === "confident" || state.topicIds.includes(topicId))
    .map(({ topicId, band }) => ({ topicId, possible: band !== "confident" }));
}

const toggled = <T>(list: T[], item: T): T[] => (list.includes(item) ? list.filter((other) => other !== item) : [...list, item]);

export function toggleTopic(state: FilterState, topicId: number): FilterState {
  return { ...state, unfiled: false, topicIds: toggled(state.topicIds, topicId) };
}

export function toggleArea(state: FilterState, areaId: number): FilterState {
  return { ...state, unfiled: false, areaIds: toggled(state.areaIds, areaId) };
}

/** What clicking a chip does: the category selection becomes that one topic. */
export function selectTopicOnly(state: FilterState, topicId: number): FilterState {
  return { ...state, unfiled: false, topicIds: [topicId], areaIds: [] };
}

export function toggleUnfiled(state: FilterState): FilterState {
  return state.unfiled ? { ...state, unfiled: false } : { ...state, unfiled: true, topicIds: [], areaIds: [] };
}

export function toggleAuthor(state: FilterState, handle: string): FilterState {
  const active = state.author !== null && sameHandle(state.author, handle);
  return { ...state, author: active ? null : handle };
}
