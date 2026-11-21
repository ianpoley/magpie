/** How the post list is laid out: cards with attachments in the margin, or dense rows under month headings. */
export type PostLayout = "cards" | "rows";

/** Read by the page on the server, so the first paint already has the reader's layout. */
export const LAYOUT_COOKIE = "magpie-layout";

export const parseLayout = (value: string | undefined): PostLayout => (value === "rows" ? "rows" : "cards");

export function saveLayout(layout: PostLayout) {
  document.cookie = `${LAYOUT_COOKIE}=${layout}; path=/; max-age=31536000; samesite=lax`;
}
