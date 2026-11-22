"use client";

import { createDialogController, Dialog, DialogBackdrop, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@ui-sdk/react/dialog";
import { Field, FieldLabel } from "@ui-sdk/react/field";
import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/react/radio";
import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from "@ui-sdk/react/segmented-control";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@ui-sdk/react/tabs";
import { Activity, AtSign, CircleCheck, KeyRound, Sparkles, Tags, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";

import { loadSettings, saveAnswerModel, saveFocus, saveJevKey } from "@/app/actions";
import type { ActionErrorCode, AnswerModelState, FocusMode, SettingsState, SkillLink, SyncState } from "@/lib/types";

import { KEPT, type ConnectXController } from "./connect-x-dialog";
import { FocusChoice, focusIncomplete } from "./focus-choice";
import { FormAlert } from "./form-alert";
import { formatCount, plural } from "./format";
import { ResortDialog, type ResortOutcome } from "./resort-dialog";
import { SecretField } from "./secret-field";
import type { SyncController } from "./sync-status";
import { dialogContent, iconButton, pageColors, primaryAnswer, softButton } from "./styles";

export const createSettingsController = () => createDialogController();
export type SettingsController = ReturnType<typeof createSettingsController>;

type SectionId = "categories" | "x" | "answers" | "jev" | "status";

const SECTIONS: { id: SectionId; title: string; description: string | null; icon: LucideIcon }[] = [
  { id: "categories", title: "Categories", description: "Choose which categories the sidebar shows when Magpie sorts your posts.", icon: Tags },
  { id: "x", title: "X", description: "Magpie reads your bookmarks and likes through your X session.", icon: AtSign },
  {
    id: "answers",
    title: "Answers",
    description: "Choose the Claude model that writes Ask answers, and how long it thinks. Each answer reads up to 400,000 characters of matching posts.",
    icon: Sparkles,
  },
  { id: "jev", title: "Jev key", description: "Jev sorts each post into topics. For Ask, it checks every saved post against your question.", icon: KeyRound },
  { id: "status", title: "Status", description: null, icon: Activity },
];

const SKILL_STATUS: Record<SkillLink, { ok: boolean; title: string; hint: string | null }> = {
  linked: { ok: true, title: "The Claude skill is linked", hint: null },
  missing: { ok: false, title: "The Claude skill isn't linked", hint: "Link it with bun run setup." },
  elsewhere: { ok: false, title: "The Claude skill links to another copy of Magpie", hint: "Link this one with bun run setup." },
  none: { ok: false, title: "The Claude skill isn't linked", hint: "Install Claude Code, then link it with bun run setup." },
};

const MODEL_DETAIL: Record<string, string> = {
  "claude-opus-5-5": "The default. It writes strong answers at a moderate cost.",
  "claude-sonnet-5-5": "It's faster and uses less of your Claude plan.",
  "claude-haiku-5-5": "It's the fastest and uses the least of your Claude plan. Its answers are thinner.",
  "claude-fable-5-2": "The most capable model. It's the slowest and uses the most of your Claude plan.",
};

const EFFORT_LABEL: Record<string, string> = { low: "Low", medium: "Medium", high: "High", xhigh: "X-high", max: "Max" };

const EFFORT_DETAIL: Record<string, string> = {
  low: "It answers quickly and thinks the least.",
  medium: "The default. It balances depth and speed.",
  high: "It thinks longer before it answers.",
  xhigh: "It thinks much longer. An answer can take a few minutes.",
  max: "It thinks as long as it needs. An answer can take ten minutes or more.",
};

const EFFORT_ITEM = "focus-ring h-8 flex-1 px-2.5 text-[13px] font-semibold whitespace-nowrap";

function needsAttention(id: SectionId, settings: SettingsState, sync: SyncState): boolean {
  if (id === "x") return sync.connection !== "connected";
  if (id === "jev") return !settings.jevKeyStored;
  if (id === "status") return !sync.workerAlive || !SKILL_STATUS[settings.skillLink].ok;
  return false;
}

export const settingsNeedAttention = (settings: SettingsState, sync: SyncState): boolean => SECTIONS.some(({ id }) => needsAttention(id, settings, sync));

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
  return `${moved} ${formatCount(skipped)} stayed as ${plural(skipped, "it was", "they were")}, because ${plural(skipped, "it", "they")} changed after the preview.`;
}

function CategoriesSection({ saved: initial }: { saved: { mode: FocusMode; focus: string } }) {
  const [saved, setSaved] = useState(initial);
  const [mode, setMode] = useState(initial.mode);
  const [focus, setFocus] = useState(initial.focus);
  const [failure, setFailure] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [resorting, setResorting] = useState(false);
  const [saving, startSaving] = useTransition();

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
          setNote("Saved. New categories follow the new setting. Existing ones stay as they are.");
          setResorting(true);
        } else {
          setNote("Saved.");
        }
      } catch {
        setFailure("Magpie couldn't save the setting. Try again.");
      }
    });
  };

  return (
    <>
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
    </>
  );
}

function connectionText({ connection, handle }: SyncState): string {
  if (connection === "needs_reconnect") return "X stopped accepting the saved cookies";
  if (connection === "not_connected") return "X isn't connected";
  return handle ? `Connected as @${handle}` : "Connected";
}

function XSection({ sync, connectX }: { sync: SyncState; connectX: ConnectXController }) {
  const connected = sync.connection === "connected";
  return (
    <div className={`flex items-center gap-3 rounded-inner px-3 py-2.5 ${connected ? "bg-success-soft" : "bg-sunken"}`}>
      <AtSign className={`size-4 shrink-0 ${connected ? "text-success" : "text-ink-muted"}`} aria-hidden="true" />
      <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{connectionText(sync)}</p>
      <DialogTrigger controller={connectX} className={`${softButton} bg-surface`}>
        {sync.connection === "connected" ? "Manage" : "Reconnect"}
      </DialogTrigger>
    </div>
  );
}

function AnswersSection({ saved: initial }: { saved: AnswerModelState }) {
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
        setFailure("Magpie couldn't save the setting. Try again.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <Field>
        <FieldLabel className="text-[13px] font-semibold text-ink">Model</FieldLabel>
        <RadioGroup value={choice.model} onValueChange={(next) => next && next !== choice.model && save({ ...choice, model: String(next) })} className="flex flex-col gap-2">
          {initial.models.map((option) => (
            <label
              key={option.id}
              className="flex cursor-pointer items-center gap-3 rounded-inner bg-sunken px-3.5 py-3 shadow-[inset_0_0_0_1px_transparent] transition-[background-color,box-shadow] duration-150 ease-out has-[[data-checked]]:bg-primary-soft has-[[data-checked]]:shadow-[inset_0_0_0_1.5px_var(--color-primary)]"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[14px] font-semibold text-ink">{option.label}</span>
                <span className="text-[13px] leading-snug text-pretty text-ink-muted">{MODEL_DETAIL[option.id] ?? ""}</span>
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
        setFailure({ code: "failed", message: "Magpie couldn't save the key. Try again." });
      }
    });
  };

  const fieldError = failure ? jevFieldError(failure.code, failure.message) : null;
  const formError = failure && fieldError === null ? failure.message : null;
  return (
    <div className="flex flex-col gap-4">
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
            description={`Magpie checks it with Jev, then keeps it ${kept}.`}
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
    </div>
  );
}

function StatusSection({ settings, sync }: { settings: SettingsState; sync: SyncState }) {
  const skill = SKILL_STATUS[settings.skillLink];
  return (
    <div className="flex flex-col gap-2">
      <StatusRow
        ok={sync.workerAlive}
        title={sync.workerAlive ? "Background sync is running" : "Background sync isn't running"}
        hint={sync.workerAlive ? null : "Start it with bun run setup."}
      />
      <StatusRow ok={skill.ok} title={skill.title} hint={skill.hint} />
    </div>
  );
}

export function SettingsDialog({
  controller,
  settings: initialSettings,
  sync,
  connectX,
  onLoad,
}: {
  controller: SettingsController;
  settings: SettingsState;
  sync: SyncController;
  connectX: ConnectXController;
  onLoad: (settings: SettingsState) => void;
}) {
  const [{ settings, version }, setLoaded] = useState({ settings: initialSettings, version: 0 });
  const [tab, setTab] = useState<SectionId>("categories");
  const state = sync.state;

  const reload = () => {
    void loadSettings()
      .then((fresh) => {
        onLoad(fresh);
        setLoaded((current) => (JSON.stringify(fresh) === JSON.stringify(current.settings) ? current : { settings: fresh, version: current.version + 1 }));
      })
      .catch(() => undefined);
  };

  const bodies: Record<SectionId, ReactNode> = {
    categories: <CategoriesSection saved={{ mode: settings.focus.mode, focus: settings.focus.focus }} />,
    x: <XSection sync={state} connectX={connectX} />,
    answers: <AnswersSection saved={settings.answerModel} />,
    jev: <JevSection stored={settings.jevKeyStored} kept={KEPT[state.secretBackend ?? "unknown"]} />,
    status: <StatusSection settings={settings} sync={state} />,
  };

  return (
    <Dialog controller={controller} onOpenChange={(open) => open && reload()}>
      <DialogBackdrop />
      <DialogContent className={`${dialogContent} h-[min(40rem,calc(100dvh-2rem))] w-[min(52rem,calc(100%-1.5rem))] max-w-none bg-canvas ${pageColors}`}>
        <Tabs value={tab} onValueChange={(next) => next && setTab(next as SectionId)} orientation="vertical" className="flex h-full min-h-0 flex-col sm:flex-row">
          <div className="flex shrink-0 flex-col gap-2 border-b border-line px-3 pt-4 pb-3 sm:w-56 sm:gap-3 sm:border-r sm:border-b-0 sm:p-4">
            <div className="flex items-center justify-between pl-2">
              <DialogTitle className="text-display text-[20px] text-ink">Settings</DialogTitle>
              <DialogClose aria-label="Close settings" className={`${iconButton} size-10 sm:hidden!`}>
                <X aria-hidden="true" />
              </DialogClose>
            </div>
            <TabsList aria-label="Settings sections" className="-mx-3 flex flex-row gap-0.5 overflow-x-auto border-0 bg-transparent px-3 py-1 sm:mx-0 sm:flex-col sm:overflow-visible sm:px-0">
              {SECTIONS.map(({ id, title, icon: Icon }) => (
                <TabsTab
                  key={id}
                  value={id}
                  className="focus-ring pressable flex h-9 shrink-0 cursor-pointer items-center justify-start gap-2.5 rounded-[10px] border-0 bg-transparent px-2.5 text-[13px] font-medium whitespace-nowrap text-ink hover:bg-sunken data-selected:bg-surface data-selected:shadow-card pointer-coarse:h-11"
                >
                  <Icon className="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
                  {title}
                  {needsAttention(id, settings, state) ? (
                    <>
                      <span aria-hidden="true" className="ml-auto size-2 shrink-0 rounded-full bg-like" />
                      <span className="sr-only">, needs attention</span>
                    </>
                  ) : null}
                </TabsTab>
              ))}
            </TabsList>
          </div>
          {SECTIONS.map(({ id, title, description }) => (
            <TabsPanel key={id} value={id} keepMounted className="min-h-0 flex-1 overflow-y-auto overscroll-contain outline-none not-data-selected:hidden">
              <div className="flex items-start gap-3 px-5 pt-6 pb-2 sm:px-8">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <h2 className="text-display text-[22px] text-ink">{title}</h2>
                  {description ? <p className="max-w-[60ch] text-[13px] leading-[1.5] text-pretty text-ink-muted">{description}</p> : null}
                </div>
                <DialogClose aria-label="Close settings" className={`${iconButton} -mt-1 -mr-3 max-sm:hidden`}>
                  <X aria-hidden="true" />
                </DialogClose>
              </div>
              <div key={version} className="max-w-[34rem] px-5 pt-3 pb-8 sm:px-8">
                {bodies[id]}
              </div>
            </TabsPanel>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
