import { highlightRanges } from "@/lib/search";
import type { Media, QuotedPost } from "@/lib/types";

import { AuthorAvatar } from "./author-avatar";

const URL_PATTERN = /https?:\/\/[^\s]+/g;

export function Marked({ text, keyword }: { text: string; keyword: string }) {
  const ranges = highlightRanges(text, keyword);
  if (ranges.length === 0) return text;
  const parts: React.ReactNode[] = [];
  let at = 0;
  for (const [start, end] of ranges) {
    if (start > at) parts.push(text.slice(at, start));
    parts.push(<mark key={start}>{text.slice(start, end)}</mark>);
    at = end;
  }
  if (at < text.length) parts.push(text.slice(at));
  return parts;
}

/**
 * Post text with search matches marked. With `links`, addresses in the text
 * become links; a card leaves them plain because the whole card opens the post.
 */
export function PostText({
  text,
  keyword,
  links = false,
  className = "",
}: {
  text: string;
  keyword: string;
  links?: boolean;
  className?: string;
}) {
  let body: React.ReactNode = <Marked text={text} keyword={keyword} />;
  if (links) {
    const parts: React.ReactNode[] = [];
    let at = 0;
    for (const match of text.matchAll(URL_PATTERN)) {
      const url = match[0].replace(/[.,;:!?)\]]+$/, "");
      if (match.index > at) parts.push(<Marked key={`t${at}`} text={text.slice(at, match.index)} keyword={keyword} />);
      parts.push(
        <a
          key={`a${match.index}`}
          href={url}
          target="_blank"
          rel="noreferrer"
          className="focus-ring rounded-[4px] font-medium text-primary-text underline decoration-[color-mix(in_oklch,var(--color-primary)_40%,transparent)] underline-offset-2 hover:decoration-primary"
        >
          <Marked text={url} keyword={keyword} />
        </a>,
      );
      at = match.index + url.length;
    }
    if (at < text.length) parts.push(<Marked key={`t${at}`} text={text.slice(at)} keyword={keyword} />);
    body = parts;
  }
  return <p className={`max-w-[65ch] text-[15px] leading-[1.55] break-words whitespace-pre-wrap text-ink ${className}`}>{body}</p>;
}

const GRID: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-2" };

/** A post's pictures. `full` shows each whole; otherwise up to four cropped previews. */
export function MediaGrid({ media, full = false }: { media: Media[]; full?: boolean }) {
  if (media.length === 0) return null;
  if (full) {
    return (
      <div className="flex flex-col gap-2">
        {media.map((item) => (
          // eslint-disable-next-line @next/next/no-img-element -- remote X media, shown as saved; nothing to optimize locally
          <img key={item.url} src={item.url} alt="" loading="lazy" referrerPolicy="no-referrer" className="img-outline max-h-[70dvh] w-full rounded-inner bg-sunken object-contain" />
        ))}
      </div>
    );
  }
  const shown = media.slice(0, 4);
  const more = media.length - shown.length;
  return (
    <div className={`grid gap-1.5 ${GRID[shown.length]}`}>
      {shown.map((item, index) => (
        <div key={item.url} className={`relative overflow-hidden rounded-inner bg-sunken ${shown.length === 1 ? "aspect-[16/9]" : "aspect-[4/3]"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- remote X media, shown as saved; nothing to optimize locally */}
          <img src={item.url} alt="" loading="lazy" referrerPolicy="no-referrer" className="img-outline size-full rounded-inner object-cover" />
          {more > 0 && index === shown.length - 1 ? (
            <span className="absolute right-1.5 bottom-1.5 rounded-full bg-ink px-2 py-0.5 text-[11px] font-semibold text-surface tabular-nums">
              +{more}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** The post this one quotes, set into the card as an inner surface. */
export function Quoted({ quoted, keyword, full = false }: { quoted: QuotedPost; keyword: string; full?: boolean }) {
  const handle = quoted.authorHandle ?? "";
  const name = quoted.authorName ?? (handle || "Quoted post");
  return (
    <blockquote className="flex flex-col gap-2 rounded-inner bg-sunken p-3">
      <div className="flex items-center gap-2 text-[13px]">
        <AuthorAvatar handle={handle || name} name={name} url={quoted.authorAvatarUrl} size="sm" ring={false} />
        <span className="truncate font-semibold text-ink">{name}</span>
        {handle ? <span className="truncate text-ink-muted">@{handle}</span> : null}
      </div>
      {quoted.text ? (
        <PostText text={quoted.text} keyword={keyword} links={full} className={`text-[14px] ${full ? "" : "line-clamp-4"}`} />
      ) : null}
      <MediaGrid media={quoted.media} full={full} />
    </blockquote>
  );
}
