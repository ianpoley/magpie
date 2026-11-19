"use client";

export function TopicChip({
  name,
  possible = false,
  active = false,
  onSelect,
}: {
  name: string;
  possible?: boolean;
  active?: boolean;
  onSelect: () => void;
}) {
  const tone = active
    ? "bg-primary-soft text-primary-text"
    : possible
      ? "bg-chip-possible text-chip-possible-text shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-chip"
      : "bg-chip text-chip-text hover:bg-[color-mix(in_oklch,var(--color-chip)_88%,var(--color-ink))]";
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={possible ? `Filter to ${name}, a possible match` : `Filter to ${name}`}
      className={`focus-ring pressable relative inline-flex h-6 max-w-full cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold before:absolute before:-inset-y-2 before:inset-x-0 ${tone}`}
    >
      <span className="truncate">{name}</span>
      {possible ? <span className="text-[10px] font-semibold tracking-[0.04em] uppercase">possible</span> : null}
    </button>
  );
}
