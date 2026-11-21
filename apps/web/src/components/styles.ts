const ICON_BUTTON =
  "focus-ring pressable inline-flex size-8 shrink-0 cursor-pointer no-underline items-center justify-center rounded-full border-0 bg-transparent p-0 text-ink-muted " +
  "[&>svg]:size-4";

export const iconButton = `${ICON_BUTTON} hover:bg-sunken hover:text-ink`;
export const dangerIconButton = `${ICON_BUTTON} hover:bg-like-soft hover:text-like-text disabled:cursor-progress disabled:opacity-60`;

export const pillControl =
  "focus-ring pressable inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border-0 bg-surface px-3.5 text-[13px] font-medium text-ink shadow-card " +
  "[&>svg]:size-3.5 [&>svg]:text-ink-muted hover:bg-surface hover:shadow-card-hover";

export const menuContent =
  "min-w-44 origin-(--transform-origin) rounded-[14px] border-0 bg-surface p-1.5 text-[13px] text-ink shadow-(--ui-shadow) " +
  "transition-[opacity,scale] duration-150 ease-out data-starting-style:scale-96 data-starting-style:opacity-0 " +
  "data-ending-style:scale-96 data-ending-style:opacity-0 motion-reduce:transition-none";

export const menuItem =
  "rounded-[9px] data-highlighted:bg-sunken data-checked:font-semibold data-checked:text-primary-text [&_[data-slot=menu-item-indicator]]:text-primary";

export const pageColors =
  "[--ui-background:var(--color-surface)] [--ui-foreground:var(--color-ink)] [--ui-muted:var(--color-sunken)] " +
  "[--ui-muted-foreground:var(--color-ink-muted)] [--ui-border:var(--color-line)]";

export const dialogContent =
  "gap-0 overflow-hidden rounded-[20px] border-0 p-0 data-starting-style:translate-y-3 data-starting-style:scale-[0.97] data-ending-style:scale-[0.97]";

const POPUP_MOTION =
  "transition-[opacity,translate,scale] duration-200 ease-out data-starting-style:opacity-0 data-ending-style:opacity-0 motion-reduce:transition-none";

export const alertContent =
  `w-[min(26rem,calc(100%-1.5rem))] gap-0 rounded-[20px] border-0 p-5 data-starting-style:scale-[0.97] data-ending-style:scale-[0.97] ${POPUP_MOTION}`;

export const alertBackdrop =
  "bg-[color-mix(in_oklch,var(--color-ink)_45%,transparent)] transition-opacity duration-150 ease-out data-starting-style:opacity-0 data-ending-style:opacity-0 motion-reduce:transition-none";

const ANSWER = "focus-ring pressable h-9 cursor-pointer rounded-full px-4 text-[13px] font-semibold data-pending:cursor-progress data-pending:opacity-70";

export const quietAnswer = `${ANSWER} border-0 bg-surface text-ink shadow-card hover:bg-surface hover:shadow-card-hover`;
export const primaryAnswer = `${ANSWER} bg-primary-fill border-0 text-on-primary shadow-primary disabled:cursor-default disabled:opacity-50`;
const DANGER = "border-0 bg-like-soft text-like-text hover:bg-[color-mix(in_oklch,var(--color-like-soft)_88%,var(--color-like))]";
export const dangerAnswer = `${ANSWER} ${DANGER}`;
export const dangerButton = `pressable focus-ring h-9 gap-1.5 px-3.5 ${DANGER} disabled:cursor-progress disabled:opacity-60`;

export const softButton =
  "focus-ring pressable flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-sunken px-3 text-[13px] font-semibold text-ink hover:bg-primary-soft hover:text-primary-text disabled:cursor-progress disabled:opacity-60";

export const popupList =
  `${menuContent} max-h-[min(18rem,var(--available-height))] w-(--anchor-width) overflow-y-auto overscroll-contain`;

export const textField =
  "w-full rounded-full text-[16px] outline-none transition-shadow duration-150 ease-out placeholder:text-ink-muted " +
  "focus-visible:border-primary focus-visible:shadow-[0_0_0_1px_var(--color-primary)] sm:text-[14px]";
