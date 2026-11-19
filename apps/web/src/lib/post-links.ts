export const URL_PATTERN = /https?:\/\/[^\s]+/g;

const TRAILING_PUNCTUATION = /[.,;:!?)\]]+$/;
const DISPLAY_CHARS = 36;

/** An address in post text, without the punctuation that closes the sentence around it. */
export const trimUrl = (url: string): string => url.replace(TRAILING_PUNCTUATION, "");

/** An address on X itself, such as another post. */
export const X_URL = /https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/\S*/gi;

const shownWithPost = (target: string, postId: string, quotedId: string | null): boolean => {
  const match = /^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/[^/]+\/status\/(\d+)(\/(?:photo|video)\/\d+)?/i.exec(target);
  if (match === null) return false;
  return (match[1] === postId && match[2] !== undefined) || (match[1] === quotedId && match[2] === undefined);
};

/**
 * Post text with each shortened address replaced by where it leads, read from
 * the store's resolved links. As on X, addresses that only point at the post's
 * own picture or video, or at the post it quotes, are dropped, since those are
 * shown with the post.
 */
export function expandLinks(text: string, postId: string, targets: ReadonlyMap<string, string>, quotedId: string | null = null): string {
  if (targets.size === 0) return text;
  const expanded = text.replace(URL_PATTERN, (found) => {
    const url = targets.has(found) ? found : trimUrl(found);
    const target = targets.get(url);
    if (target === undefined) return found;
    const tail = found.slice(url.length);
    return shownWithPost(target, postId, quotedId) ? tail : target + tail;
  });
  return expanded === text ? text : expanded.trimEnd();
}

/** A full address as it reads in a post: no scheme or `www.`, and long ones cut short. */
export function displayUrl(url: string): string {
  const bare = url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
  return bare.length > DISPLAY_CHARS ? `${bare.slice(0, DISPLAY_CHARS - 1)}…` : bare;
}

/** The address a resolved link should open: only http(s), and nothing that would split it in the text. */
export const usableTarget = (target: string | null): target is string =>
  target !== null && /^https?:\/\/\S+$/i.test(target);

/** Plain text with every address shortened, for one-line previews. */
export const shortenUrls = (text: string): string => text.replace(URL_PATTERN, (found) => {
  const url = trimUrl(found);
  return displayUrl(url) + found.slice(url.length);
});

/** Text without a trailing address to `url`, for a card that shows that link's title on its own. */
export function withoutTrailingUrl(text: string, url: string | null): string {
  if (url === null) return text;
  const trimmed = text.trimEnd();
  return trimmed.endsWith(url) ? trimmed.slice(0, -url.length).trimEnd() : text;
}

const TRACKING = /^(utm_\w+|fbclid|gclid|mc_cid|mc_eid|ref_src|ref_url)$/i;

/** An address without the tracking parameters campaigns add, which say nothing about the page. */
export function withoutTracking(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const keys = [...parsed.searchParams.keys()];
  if (!keys.some((key) => TRACKING.test(key))) return url;
  for (const key of keys) if (TRACKING.test(key)) parsed.searchParams.delete(key);
  return parsed.toString().replace(/\?$/, "");
}
