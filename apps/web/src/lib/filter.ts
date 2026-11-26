import { keywordMatcher, keywordTerms, narrows } from "./search.ts";
import type { AuthorCount, Band, Chip, Collection, FilterResult, FilterState, Post, Snapshot, TimeRange } from "./types.ts";

export const DEFAULT_FILTER: FilterState = {
  collection: "everything",
  topicIds: [],
  areaIds: [],
  unfiled: false,
  author: null,
  keyword: "",
  timeRange: "all",
  sort: "added",
  mediaOnly: false,
  revealHidden: false,
};

export const MOST_SAVED_AUTHORS = 10;

const inCollection = (post: Post, collection: Collection): boolean =>
  collection === "everything" || (collection === "bookmarks" ? post.bookmarked : post.liked);

const DAY_MS = 24 * 60 * 60 * 1000;
const RANGE_DAYS: Record<Exclude<TimeRange, "all">, number> = { week: 7, month: 30, year: 365 };

const sameHandle = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

const newestFirst = (a: Post, b: Post): number =>
  (b.createdAtMs ?? -Infinity) - (a.createdAtMs ?? -Infinity) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const ORDER: Record<FilterState["sort"], (a: Post, b: Post) => number> = {
  newest: newestFirst,
  added: (a, b) => (b.addedAtMs ?? -Infinity) - (a.addedAtMs ?? -Infinity) || newestFirst(a, b),
  oldest: (a, b) => (a.createdAtMs ?? Infinity) - (b.createdAtMs ?? Infinity) || newestFirst(a, b),
  most_liked: (a, b) => b.likeCount - a.likeCount || newestFirst(a, b),
};

export type ViewFilter = Pick<FilterState, "collection" | "author" | "timeRange" | "mediaOnly" | "keyword">;

export function inView(state: ViewFilter, now: number): (post: Post) => boolean {
  const since = state.timeRange === "all" ? null : now - RANGE_DAYS[state.timeRange] * DAY_MS;
  const matchesKeyword = keywordMatcher(state.keyword);
  return (post) =>
    inCollection(post, state.collection) &&
    (state.author === null || sameHandle(post.authorHandle, state.author)) &&
    (since === null || (post.createdAtMs !== null && post.createdAtMs >= since)) &&
    (!state.mediaOnly || post.media.length > 0) &&
    matchesKeyword(post);
}

type Narrowed = { terms: string[]; matched: Post[] };

const NARROWED_SCOPES = 24;
const narrowedBySnapshot = new WeakMap<Snapshot, Map<string, Narrowed>>();

function narrowedFor(snapshot: Snapshot): Map<string, Narrowed> {
  let scopes = narrowedBySnapshot.get(snapshot);
  if (!scopes) {
    scopes = new Map();
    narrowedBySnapshot.set(snapshot, scopes);
  }
  if (scopes.size > NARROWED_SCOPES) scopes.clear();
  return scopes;
}

export function applyFilter(snapshot: Snapshot, state: FilterState, now: number, held: ReadonlySet<string> = new Set()): FilterResult {
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
  const viewed = inView(state, now);

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

  const placement = (post: Post): Band | null => {
    if (post.hidden && !showHidden) return null;
    if (state.unfiled && !post.unfiled) return null;
    if (!viewed(post)) return null;
    return categorySelected ? selectionBand(post) : "confident";
  };

  const terms = keywordTerms(state.keyword);
  const scope = JSON.stringify([state.collection, state.author, state.timeRange, state.mediaOnly, state.revealHidden, state.unfiled, topicIds, areaIds, now, [...held].sort()]);
  const scopes = narrowedFor(snapshot);
  const before = scopes.get(scope);
  const candidates = before && narrows(before.terms, terms) ? before.matched : snapshot.posts;

  const matched: Post[] = [];
  const confident: Post[] = [];
  const unsure: Post[] = [];
  for (const post of candidates) {
    const band = placement(post) ?? (held.has(post.id) ? "confident" : null);
    if (band === null) continue;
    matched.push(post);
    if (band === "confident") confident.push(post);
    else unsure.push(post);
  }
  scopes.set(scope, { terms, matched });

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

export type CategoryCounts = { topics: Map<number, number>; areas: Map<number, number>; unfiled: number };

export function categoryCounts(snapshot: Snapshot, revealHidden: boolean, viewed: (post: Post) => boolean = () => true): CategoryCounts {
  const topicsById = new Map(snapshot.topics.map((topic) => [topic.id, topic]));
  const areasById = new Map(snapshot.areas.map((area) => [area.id, area]));
  const counts: CategoryCounts = { topics: new Map(), areas: new Map(), unfiled: 0 };
  for (const post of snapshot.posts) {
    if (!viewed(post)) continue;
    const shown = revealHidden || !post.hidden;
    if (shown && post.unfiled) counts.unfiled++;
    const inAreas = new Set<number>();
    for (const { topicId } of post.memberships) {
      const topic = topicsById.get(topicId);
      if (!topic) continue;
      if (shown || topic.hidden) counts.topics.set(topicId, (counts.topics.get(topicId) ?? 0) + 1);
      if (topic.areaId !== null) inAreas.add(topic.areaId);
    }
    for (const areaId of inAreas) {
      if (shown || areasById.get(areaId)?.hidden) counts.areas.set(areaId, (counts.areas.get(areaId) ?? 0) + 1);
    }
  }
  return counts;
}

export function mostSavedAuthors(posts: Post[], revealHidden: boolean, limit: number = MOST_SAVED_AUTHORS, keep: string | null = null): AuthorCount[] {
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
  const ranked = [...byHandle.values()].sort((a, b) => b.count - a.count || a.handle.localeCompare(b.handle));
  const top = ranked.slice(0, limit);
  const kept = keep === null ? undefined : byHandle.get(keep.toLowerCase());
  return kept && !top.includes(kept) ? [...top, kept] : top;
}

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
