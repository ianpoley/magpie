import type { ReactNode } from "react";

import { EmptyFlock } from "./magpie";

/** Why a list is empty and the way out, under a few birds circling a patch with nothing in it. */
export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-card bg-surface px-6 py-12 text-center shadow-card">
      <div className="mb-5">
        <EmptyFlock />
      </div>
      <h2 className="text-display text-[20px] text-ink">{title}</h2>
      <p className="mt-2 max-w-[42ch] text-[14px] leading-[1.55] text-pretty text-ink-muted">{children}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
