import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** What a list shows instead of nothing: what happened, and the way out when there is one. */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-card bg-surface px-6 py-14 text-center shadow-card">
      <span className="bg-tile-primary-soft mb-5 flex size-14 items-center justify-center rounded-[18px] text-primary-text shadow-[inset_0_0_0_1px_var(--color-line)]">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <h2 className="text-display text-[20px] text-ink">{title}</h2>
      <p className="mt-2 max-w-[42ch] text-[14px] leading-[1.55] text-pretty text-ink-muted">{children}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
