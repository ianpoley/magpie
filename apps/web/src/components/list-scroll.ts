"use client";

import { useEffect, useRef } from "react";

export type TopStore = {
  get: () => string | null;
  set: (id: string | null) => void;
  subscribe: (onChange: () => void) => () => void;
};

export function createTopStore(): TopStore {
  let current: string | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set: (id) => {
      if (id === current) return;
      current = id;
      for (const listener of listeners) listener();
    },
    subscribe: (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
  };
}

export const BAND_H = 42;
const SETTLE_MS = 120;

function firstBelow(items: HTMLCollectionOf<Element>, y: number): Element | null {
  let low = 0;
  let high = items.length - 1;
  let found: Element | null = null;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (items[mid].getBoundingClientRect().bottom > y) {
      found = items[mid];
      high = mid - 1;
    } else low = mid + 1;
  }
  return found;
}

const postIdOf = (item: Element | null): string | null =>
  item?.querySelector<HTMLElement>("[data-post-card-open]")?.dataset.postCardOpen ?? null;

export function useListScroll({
  list,
  above,
  store,
  pitch,
  onLand,
}: {
  list: React.RefObject<HTMLDivElement | null>;
  above: React.RefObject<HTMLDivElement | null>;
  store: TopStore;
  pitch: () => number;
  onLand: (index: number) => void;
}) {
  const callbacks = useRef({ pitch, onLand });
  const remeasure = useRef(() => {});
  useEffect(() => {
    callbacks.current = { pitch, onLand };
  });

  useEffect(() => {
    const root = document.documentElement;
    const node = list.current;
    if (!node) return;
    const items = node.getElementsByClassName("post-li");
    let frame = 0;
    let settle = 0;

    const measure = () => {
      frame = 0;
      const y = (parseFloat(getComputedStyle(root).getPropertyValue("--pinned-h")) || 0) + BAND_H + 1;
      const box = node.getBoundingClientRect();
      const atEnd = window.scrollY > 0 && box.bottom <= window.innerHeight && window.innerHeight + window.scrollY >= root.scrollHeight - 2;
      store.set(atEnd && items.length > 0 ? postIdOf(items[items.length - 1]) : box.top > y || box.bottom < y ? null : postIdOf(firstBelow(items, y)));
      const start = above.current?.getBoundingClientRect().top;
      const lost = box.bottom < 0 || (box.top > window.innerHeight && (above.current?.offsetHeight ?? 0) > 0);
      if (start !== undefined && lost) callbacks.current.onLand(Math.max(0, Math.floor((y - start) / callbacks.current.pitch())));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const scrolled = () => {
      root.setAttribute("data-scrolling", "");
      window.clearTimeout(settle);
      settle = window.setTimeout(() => root.removeAttribute("data-scrolling"), SETTLE_MS);
      schedule();
    };

    remeasure.current = schedule;
    const resized = new ResizeObserver(schedule);
    resized.observe(node);
    schedule();
    window.addEventListener("scroll", scrolled, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      resized.disconnect();
      window.clearTimeout(settle);
      root.removeAttribute("data-scrolling");
      window.removeEventListener("scroll", scrolled);
      window.removeEventListener("resize", schedule);
    };
  }, [list, above, store]);
  return remeasure;
}
