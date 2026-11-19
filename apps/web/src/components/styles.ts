/** Class recipes shared by hand-rolled controls. */

export const iconButton =
  "focus-ring pressable inline-flex size-8 shrink-0 cursor-pointer no-underline items-center justify-center rounded-full border-0 bg-transparent p-0 text-ink-muted " +
  "[&>svg]:size-4 hover:bg-sunken hover:text-ink";

export const pillControl =
  "focus-ring pressable inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border-0 bg-surface px-3.5 text-[13px] font-medium text-ink shadow-card " +
  "[&>svg]:size-3.5 [&>svg]:text-ink-muted hover:bg-surface hover:shadow-card-hover";

export const menuContent =
  "min-w-44 origin-(--transform-origin) rounded-[14px] border-0 bg-surface p-1.5 text-[13px] text-ink shadow-(--ui-shadow) " +
  "transition-[opacity,scale] duration-150 ease-out data-starting-style:scale-96 data-starting-style:opacity-0 " +
  "data-ending-style:scale-96 data-ending-style:opacity-0 motion-reduce:transition-none";

export const menuItem =
  "rounded-[9px] data-highlighted:bg-sunken data-checked:font-semibold data-checked:text-primary-text [&_[data-slot=menu-item-indicator]]:text-primary";
