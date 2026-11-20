"use client";
// Throwaway: the seams each Magpie direction plugs into the shared shell.

import { createContext, use, useEffect, useRef, useSyncExternalStore, type ComponentType, type ReactNode } from "react";

import type { Snapshot } from "@/lib/types";

import type { HeaderProps } from "./header-kit";

export type Brand = {
  slug: string;
  name: string;
  /** Sidebar header: the mark and wordmark. */
  Mark: ComponentType;
  /** Optional band above the page heading in main. */
  Masthead?: ComponentType;
  /** Optional art shown in empty states in place of the icon tile. */
  EmptyArt?: ComponentType;
  /** Width of the main column (default max-w-[800px]). */
  mainClass?: string;
  /** Optional layer rendered first inside <main>, behind the page content (which sits at z-index 1). */
  Backdrop?: ComponentType;
  /** Optional replacement for the main column's header: title, Surprise, search/Ask, filters, view and count. */
  Header?: ComponentType<HeaderProps>;
};

/** What the screen is showing right now, published by the shell for directions that visualise it. */
export type Live = {
  count: number;
  /** Of the posts on screen, how many are bookmarked and how many liked. */
  bookmarked: number;
  liked: number;
  total: number;
  asking: boolean;
  askQuery: string | null;
  keyword: string;
  collection: string;
  areaIds: number[];
  topicIds: number[];
  view: string;
  /** Ids of the posts in the current result, in list order. */
  ids: string[];
};
export type LiveActions = { toggleArea: (id: number) => void; selectTopic: (id: number) => void; surprise: () => void };

const EMPTY_LIVE: Live = { count: 0, bookmarked: 0, liked: 0, total: 0, asking: false, askQuery: null, keyword: "", collection: "everything", areaIds: [], topicIds: [], view: "posts", ids: [] };
let live: Live = EMPTY_LIVE;
const liveSubs = new Set<() => void>();
/** The latest actions; read at call time, never during render. */
export const liveActions: LiveActions = { toggleArea: () => {}, selectTopic: () => {}, surprise: () => {} };

export function setLiveActions(next: LiveActions) {
  Object.assign(liveActions, next);
}

export function publishLive(next: Live) {
  if (JSON.stringify(next) === JSON.stringify(live)) return;
  live = next;
  liveSubs.forEach((cb) => cb());
}
export function useLive(): Live {
  return useSyncExternalStore(
    (cb) => {
      liveSubs.add(cb);
      return () => liveSubs.delete(cb);
    },
    () => live,
    () => EMPTY_LIVE,
  );
}

export type BrandEnv = { snapshot: Snapshot; now: number; replay: number };

const Ctx = createContext<{ brand: Brand; env: BrandEnv } | null>(null);

export function BrandProvider({ brand, env, children }: { brand: Brand; env: BrandEnv; children: ReactNode }) {
  return <Ctx value={{ brand, env }}>{children}</Ctx>;
}

export function useBrand() {
  const value = use(Ctx);
  if (!value) throw new Error("useBrand outside BrandProvider");
  return value;
}

/** Things the app did that a direction may react to. Reactions never delay or gate the action itself. */
export type MagpieEvent =
  | { type: "surprise" }
  | { type: "ask" }
  | { type: "ask-done"; matches: number; failed: boolean }
  | { type: "pin" }
  | { type: "remove" }
  | { type: "copy" };

export const emitMagpie = (event: MagpieEvent) => window.dispatchEvent(new CustomEvent<MagpieEvent>("magpie", { detail: event }));

export function useMagpieEvents(handler: (event: MagpieEvent) => void) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    const on = (e: Event) => ref.current((e as CustomEvent<MagpieEvent>).detail);
    window.addEventListener("magpie", on);
    return () => window.removeEventListener("magpie", on);
  }, []);
}
