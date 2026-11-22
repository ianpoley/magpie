"use client";

import { DialogTrigger } from "@ui-sdk/react/dialog";
import { Field, FieldLabel } from "@ui-sdk/react/field";
import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/react/radio";
import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from "@ui-sdk/react/segmented-control";
import { ArrowLeft, AtSign, CircleCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useState, useTransition, type FormEvent, type ReactNode } from "react";

import { saveAnswerModel, saveFocus, saveJevKey } from "@/app/actions";
import type { ActionErrorCode, AnswerModelState, FocusMode, SettingsState, SkillLink, SyncState } from "@/lib/types";

import { ConnectXDialog, createConnectXController, KEPT } from "./connect-x-dialog";
import { FocusChoice, focusIncomplete } from "./focus-choice";
import { FormAlert } from "./form-alert";
import { formatCount, plural } from "./format";
import { ResortDialog, type ResortOutcome } from "./resort-dialog";
import { SecretField } from "./secret-field";
import { useSyncStatus } from "./sync-status";
import { pageColors, primaryAnswer, softButton } from "./styles";

const SKILL_STATUS: Record<SkillLink, { ok: boolean; title: string; hint: string | null }> = {
  linked: { ok: true, title: "The Claude skill is linked", hint: null },
  missing: { ok: false, title: "The Claude skill isn't linked", hint: "Link it with bun run setup." },
  elsewhere: { ok: false, title: "The Claude skill links to another copy of Magpie", hint: "Link this one with bun run setup." },
  none: { ok: false, title: "The Claude skill isn't linked", hint: "Install Claude Code, then link it with bun run setup." },
};

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 rounded-card bg-surface p-5 shadow-card sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 id={id} className="text-display text-[20px] text-ink">
          {title}
        </h2>
        {description ? <p className="text-[13px] leading-[1.5] text-pretty text-ink-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function StatusRow({ ok, title, hint }: { ok: boolean; title: string; hint: string | null }) {
  const Icon = ok ? CircleCheck : TriangleAlert;
  return (
    <div className={`flex items-start gap-3 rounded-inner px-3 py-2.5 ${ok ? "bg-success-soft" : "bg-sunken"}`}>
      <Icon className={`mt-0.5 size-4 shrink-0 ${ok ? "text-success" : "text-ink-muted"}`} aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-ink">{title}</p>
        {hint ? <p className="mt-0.5 text-[12px] leading-snug text-ink-muted">{hint}</p> : null}
      </div>
    </div>
  );
}

function outcomeNote({ changed, skipped }: ResortOutcome): string {
  const moved = changed === 0 ? "Saved. No category changed." : `Saved. ${formatCount(changed)} ${plural(changed, "category", "categories")} changed.`;
  if (skipped === 0) return moved;
  return `${moved} ${formatCount(skipped)} ${plural(skipped, "was", "were")} left as ${plural(skipped, "it was", "they were")}, because ${plural(skipped, "it", "they")} changed after the preview.`;
}

function FocusSection({ saved: initial }: { saved: { mode: FocusMode; focus: string } }) {
  const [saved, setSaved] = useState(initial);
  const [mode, setMode] = useState(initial.mode);
  const [focus, setFocus] = useState(initial.focus);
  const [failure, setFailure] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [resorting, setResorting] = useState(false);
  const [saving, startSaving] = useTransition();

  useLayoutEffect(
    () => () => {
      setFailure(null);
      setNote(null);
    },
    [],
  );

  const changed = mode !== saved.mode || (mode === "focus" && focus !== saved.focus);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);
    setNote(null);
    startSaving(async () => {
      try {
        const result = await saveFocus(mode, focus);
        if (!result.ok) return setFailure(result.message);
        setSaved({ mode, focus });
        if (result.areasExist) {
          setNote("Saved. Existing categories stay as they are, and new ones follow the new setting.");
          setResorting(true);
        } else {
          setNote("Saved.");
        }
      } catch {
        setFailure("The setting could not be saved. Try again.");
      }
    });
  };

  return (
    <Section id="settings-focus" title="Category focus" description="What shows in the sidebar when Magpie sorts your posts into categories.">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <FocusChoice
          mode={mode}
          focus={focus}
          onModeChange={(next) => {
            setMode(next);
            setNote(null);
          }}
          onFocusChange={(next) => {
            setFocus(next);
            setNote(null);
          }}
          disabled={saving}
        />
        {failure ? <FormAlert message={failure} /> : null}
        <div className="flex flex-wrap items-center justify-end gap-3">
          <p role="status" className="mr-auto min-w-0 text-[13px] leading-snug text-pretty text-ink-muted">
            {note}
          </p>
          <button type="submit" disabled={saving || !changed || focusIncomplete(mode, focus)} className={`${primaryAnswer} h-10 px-5`}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
      <ResortDialog open={resorting} onOpenChange={setResorting} onApplied={(outcome) => setNote(outcomeNote(outcome))} />
    </Section>
  );
}

function jevFieldError(code: string, message: string): string | null {
  return code === "jev_rejected" || code === "invalid_input" ? message : null;
}

function JevSection({ stored, kept }: { stored: boolean; kept: string }) {
  const [key, setKey] = useState("");
  const [failure, setFailure] = useState<{ code: ActionErrorCode | "failed"; message: string } | null>(null);
  const [replaced, setReplaced] = useState(false);
  const [checking, startChecking] = useTransition();

  useLayoutEffect(
    () => () => {
      setFailure(null);
      setReplaced(false);
    },
    [],
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);
    setReplaced(false);
    startChecking(async () => {
      try {
        const result = await saveJevKey(key);
        if (!result.ok) return setFailure(result);
        setKey("");
        setReplaced(true);
      } catch {
        setFailure({ code: "failed", message: "The key could not be saved. Try again." });
      }
    });
  };

  const fieldError = failure ? jevFieldError(failure.code, failure.message) : null;
  const formError = failure && fieldError === null ? failure.message : null;
  return (
    <Section id="settings-jev" title="Jev key" description="Jev sorts each post into topics and answers Ask.">
      <StatusRow ok={stored || replaced} title={replaced ? "New key saved" : stored ? "A key is saved" : "No key saved"} hint={null} />
      <form onSubmit={submit} className="flex flex-col gap-3">
        <fieldset disabled={checking} className="m-0 border-0 p-0">
          <SecretField
            name="jev"
            label="New Jev API key"
            mono={false}
            value={key}
            onChange={setKey}
            error={fieldError}
            description={`It's checked with Jev, then kept ${kept}.`}
          />
        </fieldset>
        {formError ? (
          <p role="alert" className="text-[13px] leading-snug text-like-text">
            {formError}
          </p>
        ) : null}
        <button type="submit" disabled={checking || key === ""} className={`${primaryAnswer} h-10 self-end px-5`}>
          {checking ? "Checking with Jev…" : "Replace key"}
        </button>
      </form>
    </Section>
  );
}

const MODEL_DETAIL: Record<string, string> = {
  "claude-opus-5-5": "The default. Strong answers at a moderate cost.",
  "claude-sonnet-5-5": "Faster, and lighter on your Claude plan.",
  "claude-haiku-5-5": "The fastest and lightest. Answers are thinner.",
  "claude-fable-5-2": "The most capable model. The slowest, and the heaviest on your plan.",
};

const EFFORT_LABEL: Record<string, string> = { low: "Low", medium: "Medium", high: "High", xhigh: "X-high", max: "Max" };

const EFFORT_DETAIL: Record<string, string> = {
  low: "Quick answers that think the least.",
  medium: "The default. A balance of depth and speed.",
  high: "Thinks longer before it answers.",
  xhigh: "Thinks much longer. An answer can take a few minutes.",
  max: "Thinks as long as it needs. An answer can take ten minutes or more.",
};

const EFFORT_ITEM = "focus-ring h-8 flex-1 px-2.5 text-[13px] font-semibold whitespace-nowrap";

function AnswerModelSection({ saved: initial }: { saved: AnswerModelState }) {
  const [choice, setChoice] = useState({ model: initial.model, effort: initial.effort });
  const [note, setNote] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const save = (next: { model: string; effort: string }) => {
    const before = choice;
    setChoice(next);
    setNote(null);
    setFailure(null);
    startSaving(async () => {
      try {
        const result = await saveAnswerModel(next.model, next.effort);
        if (!result.ok) {
          setChoice(before);
          return setFailure(result.message);
        }
        setNote("Saved. The next answer uses it.");
      } catch {
        setChoice(before);
        setFailure("The setting could not be saved. Try again.");
      }
    });
  };

  return (
    <Section id="settings-answers" title="Answers" description="Which Claude model writes answers to Ask, and how long it thinks. Answers read up to 400,000 characters of matching posts.">
      <div className="flex flex-col gap-5">
        <Field>
          <FieldLabel className="text-[13px] font-semibold text-ink">Model</FieldLabel>
          <RadioGroup value={choice.model} onValueChange={(next) => next && next !== choice.model && save({ ...choice, model: String(next) })} className="flex flex-col gap-2">
            {initial.models.map((option) => (
              <label
                key={option.id}
                data-slot="card"
                className="flex cursor-pointer items-center gap-3 rounded-inner bg-sunken px-3.5 py-3 shadow-[inset_0_0_0_1px_transparent] transition-[background-color,box-shadow] duration-150 ease-out has-[[data-checked]]:bg-primary-soft has-[[data-checked]]:shadow-[inset_0_0_0_1.5px_var(--color-primary)]"
              >
                <span data-slot="stack" className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[14px] font-semibold text-ink">{option.label}</span>
                  <span data-slot="hint" className="text-[13px] leading-snug text-pretty text-ink-muted">
                    {MODEL_DETAIL[option.id] ?? ""}
                  </span>
                </span>
                <Radio value={option.id} className="shrink-0">
                  <RadioIndicator />
                </Radio>
              </label>
            ))}
          </RadioGroup>
        </Field>
        <div className="flex flex-col gap-2">
          <p id="settings-effort" className="text-[13px] font-semibold text-ink">
            Effort
          </p>
          <SegmentedControl
            aria-labelledby="settings-effort"
            value={choice.effort}
            onValueChange={(next) => next && next !== choice.effort && save({ ...choice, effort: String(next) })}
            className="flex w-full border-0 bg-sunken p-[3px] sm:w-fit"
          >
            <SegmentedControlIndicator />
            {initial.efforts.map((effort) => (
              <SegmentedControlItem key={effort} value={effort} className={EFFORT_ITEM}>
                {EFFORT_LABEL[effort] ?? effort}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
          <p className="text-[13px] leading-snug text-pretty text-ink-muted">{EFFORT_DETAIL[choice.effort] ?? ""}</p>
        </div>
        {failure ? <FormAlert message={failure} /> : null}
        <p role="status" className="min-h-[1lh] text-[13px] leading-snug text-pretty text-ink-muted">
          {saving ? "Saving…" : note}
        </p>
      </div>
    </Section>
  );
}

function connectionText({ connection, handle }: SyncState): string {
  if (connection === "needs_reconnect") return "X stopped accepting the saved cookies";
  return handle ? `Connected as @${handle}` : "Connected";
}

export function SettingsScreen({ settings, sync: initialSync }: { settings: SettingsState; sync: SyncState }) {
  const router = useRouter();
  const [connectX] = useState(createConnectXController);
  const sync = useSyncStatus(initialSync);
  const disconnected = sync.state.connection === "not_connected";
  const connected = sync.state.connection === "connected";
  const skill = SKILL_STATUS[settings.skillLink];

  useEffect(() => {
    if (disconnected) router.replace("/");
  }, [disconnected, router]);

  return (
    <div className={`bg-wash min-h-dvh px-4 pt-6 pb-16 sm:px-8 sm:pt-10 ${pageColors}`}>
      <main className="mx-auto flex w-full max-w-[40rem] flex-col gap-5">
        <div className="flex flex-col gap-3">
          <Link href="/" className={`${softButton} self-start bg-surface no-underline shadow-card`}>
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Back to posts
          </Link>
          <h1 className="text-display text-[30px] text-ink">Settings</h1>
        </div>

        <FocusSection saved={{ mode: settings.focus.mode, focus: settings.focus.focus }} />

        <Section id="settings-x" title="X" description="Magpie reads your bookmarks and likes through your X session.">
          <div className={`flex items-center gap-3 rounded-inner px-3 py-2.5 ${connected ? "bg-success-soft" : "bg-sunken"}`}>
            <AtSign className={`size-4 shrink-0 ${connected ? "text-success" : "text-ink-muted"}`} aria-hidden="true" />
            <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{connectionText(sync.state)}</p>
            <DialogTrigger controller={connectX} className={`${softButton} bg-surface`}>
              {sync.state.connection === "needs_reconnect" ? "Reconnect" : "Manage"}
            </DialogTrigger>
          </div>
        </Section>

        <AnswerModelSection saved={settings.answerModel} />

        <JevSection stored={settings.jevKeyStored} kept={KEPT[sync.state.secretBackend ?? "unknown"]} />

        <Section id="settings-status" title="Status">
          <div className="flex flex-col gap-2">
            <StatusRow
              ok={sync.state.workerAlive}
              title={sync.state.workerAlive ? "Background sync is running" : "Background sync isn't running"}
              hint={sync.state.workerAlive ? null : "Start it with bun run setup."}
            />
            <StatusRow ok={skill.ok} title={skill.title} hint={skill.hint} />
          </div>
        </Section>
      </main>
      <ConnectXDialog controller={connectX} sync={sync} />
    </div>
  );
}
