import type { Media, Post } from "./types.ts";

/** X saves a video or GIF as its poster frame; the address says which. */
export function mediaKind(item: Media): "video" | "gif" | "photo" {
  if (/\/tweet_video_thumb\//.test(item.url)) return "gif";
  if (item.type === "video" || /\/(ext_tw_video_thumb|amplify_video_thumb)\//.test(item.url)) return "video";
  return "photo";
}

/** "Photo", "3 photos", "Video", "2 GIFs": the media named the way a reader counts it. Mixed sets count as photos. */
export function mediaNoun(media: Media[]): string {
  const kinds = new Set(media.map(mediaKind));
  const n = media.length;
  const only = kinds.size === 1 ? [...kinds][0] : "photo";
  if (only === "video") return n === 1 ? "Video" : `${n} videos`;
  if (only === "gif") return n === 1 ? "GIF" : `${n} GIFs`;
  return n === 1 ? "Photo" : `${n} photos`;
}

/** The pictures a post leads with: its own, or its quote's when it has none. */
export function leadMedia(post: Post): { media: Media[]; fromQuote: boolean } | null {
  if (post.media.length > 0) return { media: post.media, fromQuote: false };
  const quoted = post.quoted?.media ?? [];
  return quoted.length > 0 ? { media: quoted, fromQuote: true } : null;
}
