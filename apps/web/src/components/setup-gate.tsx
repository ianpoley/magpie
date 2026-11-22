"use client";

import { ArrowLeft, Check, CircleCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition, type FormEvent, type RefObject } from "react";

import { connectX, saveFocus, saveJevKey } from "@/app/actions";
import type { ActionErrorCode, FocusMode, SyncState } from "@/lib/types";

import { KEPT } from "./connect-x-dialog";
import { CHROME_MAC, devToolsFor, type DevTools } from "./dev-tools";
import { FocusChoice, focusIncomplete } from "./focus-choice";
import { FormAlert } from "./form-alert";
import { MagpieMark } from "./magpie";
import { SecretField } from "./secret-field";
import { primaryAnswer, quietAnswer } from "./styles";

type Step = "x" | "jev" | "focus";
type Failure = { code: ActionErrorCode | "failed"; message: string };

const FAILED: Failure = { code: "failed", message: "That did not work. Try again." };
const STEP_IN = "animate-[post-rise-in_200ms_cubic-bezier(0.22,1,0.36,1)] motion-reduce:animate-none";
const isTouch = () => "ontouchstart" in window;

let devTools: DevTools | null = null;
const devToolsSnapshot = () => (devTools ??= devToolsFor(navigator.userAgent));
const useDevTools = () => useSyncExternalStore(() => () => {}, devToolsSnapshot, () => CHROME_MAC);

const Keys = ({ children }: { children: string }) => (
  <kbd className="rounded-[6px] bg-sunken px-1.5 py-0.5 font-sans text-[13px] font-semibold text-ink">{children}</kbd>
);

function fieldOf(failure: Failure | null): "auth_token" | "ct0" | "jev" | null {
  if (failure?.code === "jev_rejected") return "jev";
  if (failure?.code !== "invalid_input") return null;
  if (failure.message.startsWith("auth_token")) return "auth_token";
  if (failure.message.startsWith("ct0")) return "ct0";
  return failure.message.startsWith("The key") ? "jev" : null;
}

const errorFor = (failure: Failure | null, field: string) => (fieldOf(failure) === field ? failure!.message : null);

function FormError({ failure }: { failure: Failure | null }) {
  if (failure === null || fieldOf(failure) !== null) return null;
  return <FormAlert message={failure.message} />;
}

function Steps({ step, handle, xDone, jevDone, focusDone }: { step: Step; handle: string | null; xDone: boolean; jevDone: boolean; focusDone: boolean }) {
  const items = [
    { key: "x", title: "Connect X", detail: xDone ? (handle ? `@${handle}` : "Connected") : "Your bookmarks and likes", done: xDone },
    { key: "jev", title: "Add your Jev key", detail: jevDone ? "Saved" : "Sorts posts into topics", done: jevDone },
    { key: "focus", title: "Choose what to show", detail: focusDone ? "Chosen" : "Everything, or only your focus", done: focusDone },
  ];
  return (
    <ol aria-label="Setup" className="m-0 flex list-none flex-col gap-1 p-0 max-lg:flex-row max-lg:gap-4">
      {items.map((item, i) => {
        const current = item.key === step;
        return (
          <li key={item.key} aria-current={current ? "step" : undefined} className={`flex min-w-0 items-start gap-3 rounded-[12px] lg:px-3 lg:py-2.5 ${current ? "lg:bg-side-wash" : ""}`}>
            <span
              className={`mt-px flex size-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold tabular-nums ${item.done ? "bg-side-ink text-side-0" : current ? "bg-side-wash text-side-ink" : "text-side-muted shadow-[inset_0_0_0_1.5px_var(--color-side-muted)]"}`}
              aria-hidden="true"
            >
              {item.done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className={`text-[14px] font-semibold ${current || item.done ? "text-side-ink" : "text-side-muted"} ${current ? "" : "max-lg:sr-only"}`}>
                {item.title}
                {item.done ? <span className="sr-only"> (done)</span> : null}
              </span>
              <span className="truncate text-[12px] text-side-muted max-lg:hidden">{item.detail}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function useStepFocus(step: Step, xDone: boolean) {
  const heading = useRef<HTMLHeadingElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const shown = useRef(step);
  useEffect(() => {
    const moved = shown.current !== step;
    shown.current = step;
    const field = body.current?.querySelector<HTMLInputElement>("input:not(:disabled)");
    if (field && !isTouch()) field.focus();
    else if (moved) heading.current?.focus();
  }, [step, xDone]);
  return { heading, body };
}

function firstStep(xDone: boolean, jevDone: boolean): Step {
  if (!xDone) return "x";
  return jevDone ? "focus" : "jev";
}

export function SetupGate({ sync, jevStored, focusChosen }: { sync: SyncState; jevStored: boolean; focusChosen: boolean }) {
  const router = useRouter();
  const [handle, setHandle] = useState(sync.handle);
  const [xDone, setXDone] = useState(sync.connection !== "not_connected");
  const [jevDone, setJevDone] = useState(jevStored);
  const [step, setStep] = useState<Step>(() => firstStep(xDone, jevStored));
  const [opening, startOpening] = useTransition();
  const [backend, setBackend] = useState(sync.secretBackend);
  const kept = KEPT[backend ?? "unknown"];
  const { heading, body } = useStepFocus(step, xDone);

  const open = () => startOpening(() => router.refresh());
  const advance = (jevSaved: boolean) => {
    if (!jevSaved) setStep("jev");
    else if (focusChosen) open();
    else setStep("focus");
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(18rem,4fr)_minmax(0,7fr)]">
      <header className="side-scope bg-side flex flex-col gap-6 px-5 py-5 lg:gap-10 lg:px-8 lg:py-8">
        <MagpieMark />
        <Steps step={step} handle={handle} xDone={xDone} jevDone={jevDone} focusDone={focusChosen} />
      </header>

      <main className="bg-wash flex justify-center px-4 pt-6 pb-16 sm:px-8 lg:pt-[12vh]">
        <div key={step} ref={body} className={`flex h-fit w-full max-w-[28rem] flex-col gap-5 rounded-card bg-surface p-5 shadow-card sm:p-7 ${STEP_IN}`}>
          {step === "x" ? (
            <XStep
              heading={heading}
              kept={kept}
              handle={xDone ? handle : null}
              connected={xDone}
              onConnected={(next, saved) => {
                setHandle(next);
                setBackend(saved.secretBackend);
                setXDone(true);
                advance(jevDone);
              }}
              onChange={() => setXDone(false)}
              onContinue={() => setStep("jev")}
              opening={opening}
            />
          ) : step === "jev" ? (
            <JevStep
              heading={heading}
              kept={kept}
              onSaved={() => {
                setJevDone(true);
                advance(true);
              }}
              onBack={() => setStep("x")}
              opening={opening}
            />
          ) : (
            <FocusStep heading={heading} onSaved={open} opening={opening} />
          )}
        </div>
      </main>
    </div>
  );
}

function StepTitle({ heading, n, children }: { heading: RefObject<HTMLHeadingElement | null>; n: number; children: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-eyebrow text-ink-muted">Step {n} of 3</p>
      <h1 ref={heading} tabIndex={-1} className="text-display text-[24px] text-ink outline-none">
        {children}
      </h1>
    </div>
  );
}

function XStep({
  heading,
  kept,
  handle,
  connected,
  onConnected,
  onChange,
  onContinue,
  opening,
}: {
  heading: RefObject<HTMLHeadingElement | null>;
  kept: string;
  handle: string | null;
  connected: boolean;
  onConnected: (handle: string | null, sync: SyncState) => void;
  onChange: () => void;
  onContinue: () => void;
  opening: boolean;
}) {
  const [authToken, setAuthToken] = useState("");
  const [ct0, setCt0] = useState("");
  const [failure, setFailure] = useState<Failure | null>(null);
  const [checking, startChecking] = useTransition();
  const tools = useDevTools();

  if (connected) {
    return (
      <>
        <StepTitle heading={heading} n={1}>
          Connect X
        </StepTitle>
        <div className="flex items-center gap-3 rounded-inner bg-success-soft px-3 py-2.5">
          <CircleCheck className="size-4 shrink-0 text-success" aria-hidden="true" />
          <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{handle ? `Connected as @${handle}` : "Connected"}</p>
          <button type="button" onClick={onChange} className="focus-ring pressable h-8 shrink-0 cursor-pointer rounded-full border-0 bg-transparent px-3 text-[13px] font-semibold text-primary-text hover:bg-surface">
            Use other cookies
          </button>
        </div>
        <button type="button" onClick={onContinue} className={`${primaryAnswer} h-10 self-end px-5`}>
          Continue
        </button>
      </>
    );
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);
    startChecking(async () => {
      try {
        const result = await connectX(authToken, ct0);
        if (!result.ok) return setFailure(result);
        onConnected(result.handle, result.sync);
      } catch {
        setFailure(FAILED);
      }
    });
  };

  const busy = checking || opening;
  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <StepTitle heading={heading} n={1}>
        Connect X
      </StepTitle>
      <p className="-mt-2 text-[14px] leading-[1.55] text-pretty text-ink-muted">
        Magpie reads your bookmarks and likes through your X session. Open{" "}
        <a href="https://x.com" target="_blank" rel="noreferrer" className="focus-ring rounded-sm font-medium text-primary-text underline underline-offset-2">
          x.com
        </a>{" "}
        signed in, press <Keys>{tools.keys}</Keys>, then go to {tools.panel} › Cookies › https://x.com and copy these two values.
      </p>
      <fieldset disabled={busy} className="m-0 flex flex-col gap-3 border-0 p-0">
        <SecretField name="auth_token" value={authToken} onChange={setAuthToken} error={errorFor(failure, "auth_token")} />
        <SecretField name="ct0" value={ct0} onChange={setCt0} error={errorFor(failure, "ct0")} />
      </fieldset>
      <FormError failure={failure} />
      <p className="text-[12px] leading-snug text-pretty text-ink-muted">
        They&rsquo;re checked with X, then kept {kept}. X&rsquo;s terms don&rsquo;t allow this, and X could limit your account.
      </p>
      <button type="submit" disabled={busy || authToken === "" || ct0 === ""} className={`${primaryAnswer} h-10 self-end px-5`}>
        {checking ? "Checking with X…" : opening ? "Opening Magpie…" : "Connect X"}
      </button>
    </form>
  );
}

function JevStep({
  heading,
  kept,
  onSaved,
  onBack,
  opening,
}: {
  heading: RefObject<HTMLHeadingElement | null>;
  kept: string;
  onSaved: () => void;
  onBack: () => void;
  opening: boolean;
}) {
  const [key, setKey] = useState("");
  const [failure, setFailure] = useState<Failure | null>(null);
  const [checking, startChecking] = useTransition();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);
    startChecking(async () => {
      try {
        const result = await saveJevKey(key);
        if (!result.ok) return setFailure(result);
        onSaved();
      } catch {
        setFailure(FAILED);
      }
    });
  };

  const busy = checking || opening;
  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <StepTitle heading={heading} n={2}>
        Add your Jev key
      </StepTitle>
      <p className="-mt-2 text-[14px] leading-[1.55] text-pretty text-ink-muted">
        Jev sorts each post into topics and answers Ask. Paste your{" "}
        <a href="https://docs.typesafe.ai" target="_blank" rel="noreferrer" className="focus-ring rounded-sm font-medium text-primary-text underline underline-offset-2">
          TypeSafe
        </a>{" "}
        API key.
      </p>
      <fieldset disabled={busy} className="m-0 border-0 p-0">
        <SecretField
          name="jev"
          label="Jev API key"
          mono={false}
          value={key}
          onChange={setKey}
          error={errorFor(failure, "jev")}
        />
      </fieldset>
      <FormError failure={failure} />
      <p className="text-[12px] leading-snug text-ink-muted">It&rsquo;s checked with Jev, then kept {kept}.</p>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} disabled={busy} className={`${quietAnswer} inline-flex items-center gap-1.5`}>
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back
        </button>
        <button type="submit" disabled={busy || key === ""} className={`${primaryAnswer} ml-auto h-10 px-5`}>
          {checking ? "Checking with Jev…" : opening ? "Opening Magpie…" : "Save and start syncing"}
        </button>
      </div>
    </form>
  );
}

function FocusStep({ heading, onSaved, opening }: { heading: RefObject<HTMLHeadingElement | null>; onSaved: () => void; opening: boolean }) {
  const [mode, setMode] = useState<FocusMode>("all");
  const [focus, setFocus] = useState("");
  const [failure, setFailure] = useState<Failure | null>(null);
  const [saving, startSaving] = useTransition();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);
    startSaving(async () => {
      try {
        const result = await saveFocus(mode, focus);
        if (!result.ok) return setFailure(result);
        onSaved();
      } catch {
        setFailure(FAILED);
      }
    });
  };

  const busy = saving || opening;
  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <StepTitle heading={heading} n={3}>
        Choose what to show
      </StepTitle>
      <p className="-mt-2 text-[14px] leading-[1.55] text-pretty text-ink-muted">
        The first sync sorts your posts into categories. Show all of them, or only the ones that match what you save posts for. You can change this later in Settings.
      </p>
      <FocusChoice mode={mode} focus={focus} onModeChange={setMode} onFocusChange={setFocus} disabled={busy} />
      {failure ? <FormAlert message={failure.message} /> : null}
      <button type="submit" disabled={busy || focusIncomplete(mode, focus)} className={`${primaryAnswer} h-10 self-end px-5`}>
        {saving ? "Saving…" : opening ? "Opening Magpie…" : "Open Magpie"}
      </button>
    </form>
  );
}
