import type { ReactNode } from "react";

import { EmptyFlock } from "./magpie";

export function EmptyState({ title, children, details, action }: { title: string; children: ReactNode; details?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-card bg-surface px-6 py-12 text-center shadow-card">
      <div className="mb-5">
        <EmptyFlock />
      </div>
      <h2 className="text-display text-[20px] text-ink">{title}</h2>
      <p className="mt-2 max-w-[42ch] text-[14px] leading-[1.55] text-balance text-ink-muted">{children}</p>
      {details ? <div className="mt-5 text-left">{details}</div> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
