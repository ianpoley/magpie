import { ExternalLink, Globe, Play } from "lucide-react";

import { authorHue } from "@/lib/author-hues";
import { mediaKind } from "@/lib/media";
import { displayUrl, trimUrl, URL_PATTERN } from "@/lib/post-links";
import { highlightRanges } from "@/lib/search";
import type { LinkedPage, Media, QuotedPost } from "@/lib/types";

import { AuthorAvatar } from "./author-avatar";
import { FadeImg } from "./fade-img";
import { MediaPlayer } from "./media-player";

export function Marked({ text, keyword, phrase = false }: { text: string; keyword: string; phrase?: boolean }) {
  const ranges = highlightRanges(text, keyword, phrase);
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

export type Mentions = { known: (handle: string) => boolean; select: (handle: string) => void };

const MENTION = /(?<![\w@])@(\w{1,15})\b/g;

function Words({ text, keyword, mentions }: { text: string; keyword: string; mentions?: Mentions }) {
  if (!mentions) return <Marked text={text} keyword={keyword} />;
  const parts: React.ReactNode[] = [];
  let at = 0;
  for (const match of text.matchAll(MENTION)) {
    const handle = match[1];
    if (!mentions.known(handle)) continue;
    if (match.index > at) parts.push(<Marked key={`t${at}`} text={text.slice(at, match.index)} keyword={keyword} />);
    parts.push(
      <button
        key={`m${match.index}`}
        type="button"
        title={`Show posts by @${handle}`}
        onClick={() => mentions.select(handle)}
        className="focus-ring cursor-pointer rounded-[4px] border-0 bg-transparent p-0 font-medium text-primary-text decoration-current/40 underline-offset-2 hover:underline"
      >
        <Marked text={match[0]} keyword={keyword} />
      </button>,
    );
    at = match.index + match[0].length;
  }
  if (at === 0) return <Marked text={text} keyword={keyword} />;
  if (at < text.length) parts.push(<Marked key={`t${at}`} text={text.slice(at)} keyword={keyword} />);
  return parts;
}

export function PostText({
  text,
  keyword,
  links = false,
  mentions,
  id,
  className = "",
}: {
  text: string;
  keyword: string;
  links?: boolean;
  mentions?: Mentions;
  id?: string;
  className?: string;
}) {
  const parts: React.ReactNode[] = [];
  let at = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = trimUrl(match[0]);
    if (match.index > at) parts.push(<Words key={`t${at}`} text={text.slice(at, match.index)} keyword={keyword} mentions={mentions} />);
    const label = <Marked text={displayUrl(url)} keyword={keyword} />;
    parts.push(
      links ? (
        <a
          key={`a${match.index}`}
          href={url}
          target="_blank"
          rel="noreferrer"
          className="focus-ring rounded-[4px] font-medium text-primary-text underline decoration-[color-mix(in_oklch,var(--color-primary)_40%,transparent)] underline-offset-2 hover:decoration-primary"
        >
          {label}
        </a>
      ) : (
        <span key={`a${match.index}`}>{label}</span>
      ),
    );
    at = match.index + url.length;
  }
  if (at < text.length) parts.push(<Words key={`t${at}`} text={text.slice(at)} keyword={keyword} mentions={mentions} />);
  return <p id={id} className={`max-w-[65ch] text-[15px] leading-[1.55] break-words whitespace-pre-wrap text-ink ${className}`}>{parts}</p>;
}

export function LinkedPages({ pages, keyword }: { pages: LinkedPage[]; keyword: string }) {
  if (pages.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1.5">
      {pages.map((page) => {
        const body = (
          <>
            <Globe className="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] leading-snug font-semibold text-ink">
                <Marked text={page.title} keyword={keyword} />
              </span>
              {page.host ? (
                <span className="block truncate text-[12px] leading-snug text-ink-muted">
                  <Marked text={page.host} keyword={keyword} />
                </span>
              ) : null}
            </span>
          </>
        );
        const row = "flex min-w-0 items-center gap-2.5 rounded-inner bg-sunken px-3 py-2";
        return (
          <li key={page.title} className="flex min-w-0">
            {page.url ? (
              <a
                href={page.url}
                target="_blank"
                rel="noreferrer"
                className={`${row} focus-ring w-full no-underline transition-colors duration-150 ease-out hover:bg-[color-mix(in_oklch,var(--color-sunken)_92%,var(--color-ink))]`}
              >
                {body}
                <ExternalLink className="size-3.5 shrink-0 text-ink-muted" aria-hidden="true" />
              </a>
            ) : (
              <span className={`${row} w-full`}>{body}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function MediaGrid({ media, postId }: { media: Media[]; postId: string }) {
  if (media.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {media.map((item) =>
        mediaKind(item) === "photo" ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote X media, shown as saved; nothing to optimize locally
          <img key={item.url} src={item.url} alt="" loading="lazy" referrerPolicy="no-referrer" className="img-outline max-h-[70dvh] w-full rounded-inner bg-sunken object-contain" />
        ) : (
          <MediaPlayer key={item.url} item={item} postId={postId} />
        ),
      )}
    </div>
  );
}

export function Thumb({ item, className, small = false }: { item: Media; className: string; small?: boolean }) {
  return (
    <span className={`relative block shrink-0 overflow-hidden rounded-inner bg-sunken ${className}`}>
      <FadeImg src={item.url} className="img-outline size-full rounded-[inherit] object-cover" />
      {mediaKind(item) === "photo" ? null : (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className={`flex items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--color-ink)_62%,transparent)] text-surface ${small ? "size-4" : "size-7"}`}>
            <Play className={`translate-x-px fill-current ${small ? "size-2" : "size-3.5"}`} aria-hidden="true" />
          </span>
        </span>
      )}
    </span>
  );
}

export function Quoted({
  quoted,
  keyword,
  parentId,
  mentions,
  action,
}: {
  quoted: QuotedPost;
  keyword: string;
  parentId: string;
  mentions?: Mentions;
  action?: React.ReactNode;
}) {
  const handle = quoted.authorHandle ?? "";
  const name = quoted.authorName ?? (handle || "Quoted post");
  return (
    <blockquote className="flex flex-col gap-2 rounded-inner bg-sunken p-3">
      <div className="flex items-center gap-2 text-[13px]">
        <AuthorAvatar handle={handle || name} name={name} url={quoted.authorAvatarUrl} size="sm" ring={false} />
        {handle && mentions?.known(handle) ? (
          <button
            type="button"
            title={`Show posts by ${name}`}
            onClick={() => mentions.select(handle)}
            className="focus-ring relative min-w-0 cursor-pointer rounded-[4px] border-0 bg-transparent p-0 text-left font-semibold decoration-current/40 underline-offset-2 after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[''] hover:underline"
            style={{ color: authorHue(handle).fg }}
          >
            <span className="block truncate">{name}</span>
          </button>
        ) : (
          <span className="truncate font-semibold text-ink">{name}</span>
        )}
        {handle ? <span className="truncate text-ink-muted">@{handle}</span> : null}
        {action ? <span className="ml-auto flex shrink-0">{action}</span> : null}
      </div>
      {quoted.text ? <PostText text={quoted.text} keyword={keyword} links mentions={mentions} className="text-[14px]" /> : null}
      <MediaGrid media={quoted.media} postId={quoted.id ?? parentId} />
    </blockquote>
  );
}
