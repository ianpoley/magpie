"use client";

import { ExternalLink, LoaderCircle, Play } from "lucide-react";
import { useState } from "react";

import { playableMedia } from "@/app/actions";
import { mediaKind } from "@/lib/media";
import type { Media, PlayableMedia } from "@/lib/types";

import { runAction } from "./run-action";

type Playback = { status: "idle" | "loading" | "failed" } | { status: "ready"; media: PlayableMedia; still: boolean };

const FRAME = "img-outline max-h-[70dvh] w-full rounded-inner bg-sunken object-contain";

function pick(media: PlayableMedia[], item: Media): PlayableMedia | undefined {
  return media.find((candidate) => candidate.thumbUrl === item.url) ?? (media.length === 1 ? media[0] : undefined);
}

export function MediaPlayer({ item, postId }: { item: Media; postId: string }) {
  const [playback, setPlayback] = useState<Playback>({ status: "idle" });
  const kind = mediaKind(item) === "gif" ? "GIF" : "video";

  const play = async () => {
    setPlayback({ status: "loading" });
    const read = await runAction(playableMedia(postId));
    const media = read ? pick(read.media, item) : undefined;
    if (!media) {
      setPlayback({ status: "failed" });
      return;
    }
    setPlayback({ status: "ready", media, still: window.matchMedia("(prefers-reduced-motion: reduce)").matches });
  };

  if (playback.status === "ready") {
    const { media, still } = playback;
    return media.kind === "gif" ? (
      <video src={media.videoUrl} poster={item.url} loop muted playsInline autoPlay={!still} controls={still} className={FRAME} />
    ) : (
      <video src={media.videoUrl} poster={item.url} controls autoPlay playsInline preload="metadata" className={FRAME} />
    );
  }

  return (
    <div className="relative">
      {/* eslint-disable-next-line @next/next/no-img-element -- remote X media, shown as saved; nothing to optimize locally */}
      <img src={item.url} alt="" loading="lazy" referrerPolicy="no-referrer" className={FRAME} />
      {playback.status === "failed" ? (
        <a
          href={`https://x.com/i/status/${postId}`}
          target="_blank"
          rel="noreferrer"
          className="focus-ring absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-inner bg-[color-mix(in_oklch,var(--color-ink)_62%,transparent)] text-[13px] font-semibold text-surface no-underline"
        >
          <span>This {kind} couldn’t load here</span>
          <span className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-ink">
            Open on X
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </span>
        </a>
      ) : (
        <button
          type="button"
          data-media-play
          onClick={play}
          disabled={playback.status === "loading"}
          aria-label={`Play ${kind}`}
          className="focus-ring group absolute inset-0 flex cursor-pointer items-center justify-center rounded-inner border-0 bg-transparent p-0 disabled:cursor-progress"
        >
          <span className="pressable flex size-14 items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--color-ink)_62%,transparent)] text-surface transition-transform duration-150 ease-out group-hover:scale-105 motion-reduce:transition-none">
            {playback.status === "loading" ? (
              <LoaderCircle className="size-6 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <Play className="size-6 translate-x-0.5 fill-current" aria-hidden="true" />
            )}
          </span>
        </button>
      )}
    </div>
  );
}
