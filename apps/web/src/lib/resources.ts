import { URL_PATTERN } from "./post-links.ts";
import type { Post, Resource, ResourceGroup, Snapshot } from "./types.ts";

export function resourcesFor(snapshot: Snapshot, posts: Post[]): ResourceGroup[] {
  const rank = new Map(posts.map((post, index) => [post.id, index]));
  const groups: ResourceGroup[] = [];
  for (const resource of snapshot.resources) {
    const indexes = resource.postIds.flatMap((id) => rank.get(id) ?? []);
    if (indexes.length === 0) continue;
    indexes.sort((a, b) => a - b);
    groups.push({ resource, posts: indexes.map((index) => posts[index]) });
  }
  return groups.sort((a, b) => b.posts.length - a.posts.length || a.resource.id - b.resource.id);
}

const YOUTUBE_WATCH = /^https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})$/;

export function videoStill(url: string): string | null {
  const id = YOUTUBE_WATCH.exec(url)?.[1];
  return id === undefined ? null : `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
}

export function resourceName(resource: Resource, posts: Post[]): { text: string; fromPost: boolean } {
  const title = resource.title?.trim();
  if (title && title !== resource.host) return { text: title, fromPost: false };
  const words = posts.map((post) => post.text.replace(URL_PATTERN, " ").replace(/\s+/g, " ").trim()).find(Boolean);
  if (words) return { text: words, fromPost: true };
  return posts[0] ? { text: `Shared by ${posts[0].authorName}`, fromPost: false } : { text: resource.host ?? resource.url, fromPost: false };
}
