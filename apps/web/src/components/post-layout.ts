export type PostLayout = "cards" | "rows";

export const LAYOUT_COOKIE = "magpie-layout";

export const parseLayout = (value: string | undefined): PostLayout => (value === "rows" ? "rows" : "cards");

export function saveLayout(layout: PostLayout) {
  document.cookie = `${LAYOUT_COOKIE}=${layout}; path=/; max-age=31536000; samesite=lax`;
}
