"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { playableMedia } from "@/app/actions";
import { mediaKind } from "@/lib/media";
import type { Media, PlayableMedia, Post } from "@/lib/types";

const HOVER_DELAY = 350;
const EXIT = 140;
const MAX_WIDTH = 640;
const GAP = 64;
const MARGIN = 12;

const videos = new Map<string, Promise<PlayableMedia | null>>();

function loadVideo(sourceId: string, item: Media) {
  const key = `${sourceId} ${item.url}`;
  const cached = videos.get(key);
  if (cached) return cached;
  const failed = () => {
    if (videos.get(key) === read) videos.delete(key);
    return null;
  };
  const read: Promise<PlayableMedia | null> = playableMedia(sourceId).then((result) => {
    if (!result.ok) return failed();
    return result.media.find((media) => media.thumbUrl === item.url) ?? (result.media.length === 1 ? result.media[0] : null);
  }, failed);
  videos.set(key, read);
  return read;
}

function playWithSound(node: HTMLVideoElement | null) {
  if (!node) return;
  node.muted = false;
  node.play().catch(() => {
    node.muted = true;
    void node.play();
  });
}

type Shown = { thumb: DOMRect; ratio: number; video: PlayableMedia | null; still: boolean };

function placement({ thumb, ratio }: Shown) {
  const room = Math.min(MAX_WIDTH, thumb.left - GAP - MARGIN, window.innerWidth - MARGIN * 2);
  const w = Math.max(0, Math.min(room, window.innerHeight * 0.8 * ratio));
  const h = w / ratio;
  const left = Math.max(MARGIN, thumb.left - GAP - w);
  const top = Math.max(MARGIN, Math.min(thumb.top + thumb.height / 2 - h / 2, window.innerHeight - h - MARGIN));
  const startX = thumb.left - 6;
  const startY = thumb.top + thumb.height / 2;
  const endX = left + w;
  const endY = Math.max(top + 24, Math.min(startY, top + h - 24));
  const bend = (startX + endX) / 2;
  return { w, h, left, top, startX, startY, leader: `M ${startX} ${startY} C ${bend} ${startY}, ${bend} ${endY}, ${endX} ${endY}` };
}

function Preview({ item, shown, open }: { item: Media; shown: Shown; open: boolean }) {
  const { thumb, video, still } = shown;
  const { w, h, left, top, startX, startY, leader } = placement(shown);
  const state = open ? "" : undefined;
  return (
    <div aria-hidden="true">
      <div data-open={state} className="media-preview-dim" style={{ left: thumb.left, top: thumb.top, width: thumb.width, height: thumb.height }} />
      <svg data-open={state} className="media-preview-leader" width="100%" height="100%">
        <path d={leader} pathLength={1} />
        <circle cx={startX} cy={startY} r={3.5} />
      </svg>
      <div data-open={state} className="media-preview" style={{ left, top, width: w, height: h }}>
        {video && !still ? (
          <video
            ref={video.kind === "gif" ? undefined : playWithSound}
            src={video.videoUrl}
            poster={item.url}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            className="img-outline size-full bg-sunken object-cover"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- remote X media, shown as saved; nothing to optimize locally
          <img src={item.url} alt="" referrerPolicy="no-referrer" className="img-outline size-full bg-sunken object-cover" />
        )}
      </div>
    </div>
  );
}

export function MediaPreview({ post, item, children }: { post: Post; item: Media; children: React.ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const openTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);
  const [shown, setShown] = useState<Shown | null>(null);
  const [open, setOpen] = useState(false);

  const close = () => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
    setOpen(false);
    closeTimer.current = window.setTimeout(() => setShown(null), EXIT);
  };

  useEffect(() => {
    if (!shown) return;
    window.addEventListener("scroll", close, { capture: true, passive: true });
    return () => window.removeEventListener("scroll", close, { capture: true });
  });

  useEffect(
    () => () => {
      window.clearTimeout(openTimer.current);
      window.clearTimeout(closeTimer.current);
    },
    [],
  );

  const enter = (event: React.PointerEvent) => {
    if (event.pointerType !== "mouse" || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    window.clearTimeout(closeTimer.current);
    window.clearTimeout(openTimer.current);
    const sourceId = post.media.includes(item) ? post.id : (post.quoted?.id ?? post.id);
    const video = mediaKind(item) === "photo" ? null : loadVideo(sourceId, item);
    openTimer.current = window.setTimeout(() => {
      const node = ref.current;
      if (!node) return;
      const img = node.querySelector("img");
      const ratio = img?.naturalWidth ? img.naturalWidth / img.naturalHeight : 1;
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setShown({ thumb: node.getBoundingClientRect(), ratio, video: null, still });
      requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)));
      void video?.then((found) => found && setShown((current) => current && { ...current, video: found }));
    }, HOVER_DELAY);
  };

  return (
    <span ref={ref} className="block" onPointerEnter={enter} onPointerLeave={close} onPointerDown={close}>
      {children}
      {shown ? createPortal(<Preview item={item} shown={shown} open={open} />, document.body) : null}
    </span>
  );
}
