"use client";

import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@ui-sdk/react/collapsible";
import { ChevronDown } from "lucide-react";
import { useState, useSyncExternalStore, type ReactNode } from "react";

const CLOSED_KEY = "magpie:sidebar-closed:";
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readOpen(id: string): boolean {
  try {
    return window.localStorage.getItem(CLOSED_KEY + id) === null;
  } catch {
    return true;
  }
}

function writeOpen(id: string, open: boolean) {
  try {
    if (open) window.localStorage.removeItem(CLOSED_KEY + id);
    else window.localStorage.setItem(CLOSED_KEY + id, "1");
  } catch {}
  listeners.forEach((listener) => listener());
}

export function SidebarSection({ id, title, label, action, children }: { id: string; title: string; label: string; action?: ReactNode; children: ReactNode }) {
  const open = useSyncExternalStore(subscribe, () => readOpen(id), () => true);
  const [toggled, setToggled] = useState(false);
  return (
    <section aria-label={label}>
      <Collapsible
        open={open}
        onOpenChange={(next) => {
          setToggled(true);
          writeOpen(id, next);
        }}
      >
        <div className="mb-1.5 flex h-7 items-center gap-2 pr-1">
          <h2 className="flex h-full min-w-0 flex-1">
            <CollapsibleTrigger className="focus-ring-side group flex h-full min-w-0 flex-1 cursor-pointer items-center gap-1 rounded-[8px] border-0 bg-transparent pr-2 pl-2.5 text-left text-eyebrow text-side-muted transition-colors duration-150 ease-out hover:text-side-ink">
              {title}
              <ChevronDown className={`size-3.5 shrink-0 group-data-closed:-rotate-90 ${toggled ? "transition-transform duration-150 ease-out motion-reduce:transition-none" : ""}`} aria-hidden="true" />
            </CollapsibleTrigger>
          </h2>
          {open ? action : null}
        </div>
        <CollapsiblePanel className={`-m-1 h-(--collapsible-panel-height) overflow-hidden p-1 data-ending-style:h-0 data-starting-style:h-0 ${toggled ? "transition-[height] duration-200 ease-out motion-reduce:transition-none" : ""}`}>
          {children}
        </CollapsiblePanel>
      </Collapsible>
    </section>
  );
}
