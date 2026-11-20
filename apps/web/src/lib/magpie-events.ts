"use client";
// Things the app did that the brand art reacts to: the sidebar mark flaps, the flock dives, glints or drops a bird.
// Reactions never delay or gate the action itself.

import { useEffect, useRef } from "react";

export type MagpieEvent = "surprise" | "ask" | "pin" | "remove" | "copy";

const EVENT = "magpie";

export const emitMagpie = (event: MagpieEvent) => window.dispatchEvent(new CustomEvent<MagpieEvent>(EVENT, { detail: event }));

export function useMagpieEvents(handler: (event: MagpieEvent) => void) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    const on = (e: Event) => ref.current((e as CustomEvent<MagpieEvent>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
}
