"use client";

import { Field, FieldDescription, FieldLabel } from "@ui-sdk/react/field";
import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from "@ui-sdk/react/segmented-control";
import { Textarea } from "@ui-sdk/react/textarea";

import { MAX_FOCUS_CHARS } from "@/lib/focus";
import type { FocusMode } from "@/lib/types";

const MODE_ITEM = "focus-ring h-8 flex-1 px-3.5 text-[13px] font-semibold whitespace-nowrap";

const MODE_DETAIL: Record<FocusMode, string> = {
  all: "Every category shows in the sidebar. You can still hide any of them yourself.",
  focus: "Categories that match your focus show. The rest start hidden, and you can show any of them yourself.",
};

export const focusIncomplete = (mode: FocusMode, focus: string) => mode === "focus" && focus.trim() === "";

export function FocusChoice({
  mode,
  focus,
  onModeChange,
  onFocusChange,
  disabled = false,
}: {
  mode: FocusMode;
  focus: string;
  onModeChange: (mode: FocusMode) => void;
  onFocusChange: (focus: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <SegmentedControl
          aria-label="What to show"
          value={mode}
          disabled={disabled}
          onValueChange={(next) => next && onModeChange(next as FocusMode)}
          className="flex w-full border-0 bg-sunken p-[3px] sm:w-fit"
        >
          <SegmentedControlIndicator />
          <SegmentedControlItem value="all" className={MODE_ITEM}>
            Show everything
          </SegmentedControlItem>
          <SegmentedControlItem value="focus" className={MODE_ITEM}>
            Only show my focus
          </SegmentedControlItem>
        </SegmentedControl>
        <p className="text-[13px] leading-snug text-pretty text-ink-muted">{MODE_DETAIL[mode]}</p>
      </div>
      {mode === "focus" ? (
        <Field name="focus" disabled={disabled}>
          <FieldLabel className="text-[13px] font-semibold text-ink">What do you save posts for?</FieldLabel>
          <Textarea
            value={focus}
            onValueChange={onFocusChange}
            maxLength={MAX_FOCUS_CHARS}
            rows={3}
            autoResize
            placeholder="climbing and trail running"
            className="max-h-48 min-h-20 rounded-inner px-3.5 py-2.5 text-[16px] leading-[1.5] transition-shadow duration-150 ease-out placeholder:text-ink-muted focus-visible:border-primary focus-visible:shadow-[0_0_0_1px_var(--color-primary)] sm:text-[14px]"
          />
          <FieldDescription className="text-[12px] text-ink-muted tabular-nums">
            {focus.length} / {MAX_FOCUS_CHARS} characters
          </FieldDescription>
        </Field>
      ) : null}
    </div>
  );
}
