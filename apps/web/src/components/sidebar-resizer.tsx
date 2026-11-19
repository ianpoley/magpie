"use client";

import { useRef, useSyncExternalStore, type KeyboardEvent, type PointerEvent } from "react";

import { clampSidebarWidth, SIDEBAR_WIDTH, SIDEBAR_WIDTH_KEY, SIDEBAR_WIDTH_VAR, storedSidebarWidth } from "./sidebar-width";

/** The post column keeps at least this much, matching the `w-sidebar` utility. */
const MAIN_MIN = 600;

const listeners = new Set<() => void>();
let width: number | null = null;

function readWidth(): number {
  if (width === null) {
    try {
      width = storedSidebarWidth(window.localStorage.getItem(SIDEBAR_WIDTH_KEY)) ?? SIDEBAR_WIDTH.fallback;
    } catch {
      width = SIDEBAR_WIDTH.fallback;
    }
  }
  return width;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function showWidth(next: number) {
  width = next;
  document.documentElement.style.setProperty(SIDEBAR_WIDTH_VAR, `${next}px`);
  for (const listener of listeners) listener();
}

function saveWidth() {
  try {
    window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(readWidth()));
  } catch {
    // Without storage the width still holds until the page is closed.
  }
}

const widest = (): number => clampSidebarWidth(window.innerWidth - MAIN_MIN);

/**
 * The right edge of the desktop sidebar: drag it, or focus it and use the
 * arrow keys, Home and End, to set the sidebar's width; double-click to go
 * back to the default. The width is kept in the browser.
 */
export function SidebarResizer({ controls }: { controls: string }) {
  const current = useSyncExternalStore(subscribe, readWidth, () => SIDEBAR_WIDTH.fallback);
  const drag = useRef<{ pointerId: number; offset: number } | null>(null);

  const set = (next: number) => {
    showWidth(clampSidebarWidth(next, widest()));
    saveWidth();
  };

  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    // Stops the press from starting a text selection.
    event.preventDefault();
    const handle = event.currentTarget;
    handle.focus({ preventScroll: true });
    handle.setPointerCapture(event.pointerId);
    // Measured, not remembered: a narrow window can hold the sidebar below its remembered width.
    const shown = handle.parentElement?.getBoundingClientRect().width ?? readWidth();
    drag.current = { pointerId: event.pointerId, offset: event.clientX - shown };
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    showWidth(clampSidebarWidth(event.clientX - drag.current.offset, widest()));
  };
  const end = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    saveWidth();
  };

  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? SIDEBAR_WIDTH.step * 3 : SIDEBAR_WIDTH.step;
    // A narrow window can hold the sidebar below its remembered width; steps start from what is shown.
    const shown = Math.min(current, widest());
    const next =
      event.key === "ArrowLeft"
        ? shown - step
        : event.key === "ArrowRight"
          ? shown + step
          : event.key === "Home"
            ? SIDEBAR_WIDTH.min
            : event.key === "End"
              ? SIDEBAR_WIDTH.max
              : null;
    if (next === null) return;
    event.preventDefault();
    set(next);
  };

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label="Resize sidebar"
      aria-orientation="vertical"
      aria-controls={controls}
      aria-valuenow={current}
      aria-valuemin={SIDEBAR_WIDTH.min}
      aria-valuemax={SIDEBAR_WIDTH.max}
      aria-valuetext={`${current} pixels wide`}
      title="Drag to resize. Double-click to reset."
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onDoubleClick={() => set(SIDEBAR_WIDTH.fallback)}
      onKeyDown={keys}
      className={
        // The hit area sits mostly outside the sidebar, clear of its scrollbar; the line it shows is on the edge itself.
        "group/resizer absolute inset-y-0 -right-2 z-10 flex w-3 cursor-col-resize touch-none justify-start outline-none select-none"
      }
    >
      <span
        aria-hidden="true"
        className="ml-[3px] h-full w-0.5 rounded-full bg-transparent transition-colors duration-150 ease-out group-hover/resizer:bg-primary group-focus-visible/resizer:bg-primary group-focus-visible/resizer:outline-2 group-focus-visible/resizer:outline-offset-1 group-focus-visible/resizer:outline-primary group-active/resizer:bg-primary"
      />
    </div>
  );
}
