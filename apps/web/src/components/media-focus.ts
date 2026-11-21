import { leadMedia } from "@/lib/media";
import type { Post } from "@/lib/types";

let requested: { postId: string; index: number } | null = null;

export function requestMediaFocus(postId: string, index = 0) {
  requested = { postId, index };
}

export function focusRequestedMedia(body: HTMLElement, post: Post): boolean {
  const request = requested;
  requested = null;
  const lead = leadMedia(post);
  if (!request || request.postId !== post.id || !lead) return false;
  const grid = body.querySelector(lead.fromQuote ? "blockquote [data-media-grid]" : ":scope > [data-media-grid]");
  const item = grid?.children[request.index];
  if (!(item instanceof HTMLElement)) return false;
  body.scrollTop = item.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - 20;
  item.querySelector<HTMLButtonElement>("[data-media-play]")?.click();
  return true;
}
