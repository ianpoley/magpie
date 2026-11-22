export const URL_PATTERN = /https?:\/\/[^\s]+/g;

const TRAILING_PUNCTUATION = /[.,;:!?]+$/;
const OPENERS: Record<string, string> = { ")": "(", "]": "[" };
const DISPLAY_CHARS = 36;

const occurrences = (text: string, char: string): number => text.split(char).length - 1;

function endsInUnmatchedBracket(url: string): boolean {
  const last = url.at(-1) ?? "";
  const opener = OPENERS[last];
  return opener !== undefined && occurrences(url, last) > occurrences(url, opener);
}

export function trimUrl(url: string): string {
  let trimmed = url.replace(TRAILING_PUNCTUATION, "");
  while (endsInUnmatchedBracket(trimmed)) trimmed = trimmed.slice(0, -1).replace(TRAILING_PUNCTUATION, "");
  return trimmed;
}

export const X_URL = /https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/\S*/gi;

const shownWithPost = (target: string, postId: string, quotedId: string | null): boolean => {
  const match = /^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/[^/]+\/status\/(\d+)(\/(?:photo|video)\/\d+)?/i.exec(target);
  if (match === null) return false;
  return (match[1] === postId && match[2] !== undefined) || (match[1] === quotedId && match[2] === undefined);
};

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

const X_ARTICLE = /^(?:x|twitter)\.com\/i\/article\/\d+$/i;

export function displayUrl(url: string): string {
  const bare = url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
  if (X_ARTICLE.test(bare)) return "X article";
  return bare.length > DISPLAY_CHARS ? `${bare.slice(0, DISPLAY_CHARS - 1)}…` : bare;
}

export const usableTarget = (target: string | null): target is string =>
  target !== null && /^https?:\/\/\S+$/i.test(target);

export const postAddress = (url: string, handle: string, postId: string): string =>
  usableTarget(url) ? url : `https://x.com/${encodeURIComponent(handle)}/status/${encodeURIComponent(postId)}`;

export const shortenUrls = (text: string): string => text.replace(URL_PATTERN, (found) => {
  const url = trimUrl(found);
  return displayUrl(url) + found.slice(url.length);
});

export function withoutTrailingUrl(text: string, url: string | null): string {
  if (url === null) return text;
  const trimmed = text.trimEnd();
  return trimmed.endsWith(url) ? trimmed.slice(0, -url.length).trimEnd() : text;
}

const TRACKING = /^(utm_\w+|fbclid|gclid|mc_cid|mc_eid|ref_src|ref_url)$/i;

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
