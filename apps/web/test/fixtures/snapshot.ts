import type { Area, Band, Post, Resource, Snapshot, Topic } from "../../src/lib/types.ts";

export const NOW = Date.parse("2026-06-15T12:00:00.000Z");

export function post(id: string, options: Partial<Post> & { in?: Record<number, Band> } = {}): Post {
  const { in: topics = {}, ...rest } = options;
  const memberships = Object.entries(topics).map(([topicId, band]) => ({ topicId: Number(topicId), band }));
  memberships.sort((a, b) => Number(b.band === "confident") - Number(a.band === "confident"));
  const createdAt = rest.createdAt === undefined ? "2026-06-01T00:00:00.000Z" : rest.createdAt;
  return {
    id,
    text: `post ${id}`,
    url: `https://x.com/someone/status/${id}`,
    authorHandle: "someone",
    authorName: "Some One",
    authorAvatarUrl: null,
    authorAvatarHue: null,
    likeCount: 0,
    replyToId: null,
    quoted: null,
    media: [],
    bookmarked: true,
    liked: false,
    linkedPages: [],
    hidden: false,
    unfiled: !memberships.some((m) => m.band === "confident"),
    pending: false,
    memberships,
    ...rest,
    createdAt,
    createdAtMs: createdAt === null ? null : Date.parse(createdAt),
    addedAtMs: rest.addedAtMs ?? null,
  };
}

export function area(id: number, name: string, options: Partial<Area> = {}): Area {
  return { id, name, kind: "auto", hidden: false, locked: false, postCount: 0, ...options };
}

export function topic(id: number, areaId: number, name: string, options: Partial<Topic> = {}): Topic {
  return {
    id,
    areaId,
    name,
    definition: `Posts about ${name}.`,
    kind: "auto",
    hidden: false,
    hiddenSelf: false,
    locked: false,
    postCount: 0,
    confidentCount: 0,
    ...options,
  };
}

export function resource(id: number, postIds: string[], options: Partial<Resource> = {}): Resource {
  return { id, kind: "repo", url: `https://example.com/r${id}`, host: "example.com", title: `Resource ${id}`, description: null, postIds, ...options };
}

export function snapshot(parts: Partial<Snapshot>): Snapshot {
  return {
    storeExists: true,
    posts: [],
    removed: [],
    areas: [],
    topics: [],
    resources: [],
    lastRun: null,
    lastCompleteRunAt: null,
    ...parts,
  };
}

export const AI = 1;
export const FRONTEND = 2;
export const POLITICS = 3;
export const EVALS = 10;
export const AGENTS = 11;
export const ANIMATIONS = 20;
export const ELECTIONS = 30;

export const AREAS = [area(AI, "AI"), area(FRONTEND, "Frontend"), area(POLITICS, "Politics", { hidden: true })];
export const TOPICS = [
  topic(EVALS, AI, "Evals"),
  topic(AGENTS, AI, "Agents"),
  topic(ANIMATIONS, FRONTEND, "Animations"),
  topic(ELECTIONS, POLITICS, "Elections", { hidden: true }),
];

export const ids = (posts: Post[]): string[] => posts.map((p) => p.id);
