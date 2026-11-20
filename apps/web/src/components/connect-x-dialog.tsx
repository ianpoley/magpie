"use client";

import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@ui-sdk/react/alert-dialog";
import { createDialogController, Dialog, DialogBackdrop, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@ui-sdk/react/dialog";
import { Field, FieldError, FieldLabel } from "@ui-sdk/react/field";
import { PasswordInput, PasswordInputControl, PasswordInputToggle } from "@ui-sdk/react/password-input";
import { CircleCheck, Eye, EyeOff } from "lucide-react";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";

import { connectX, disconnectX } from "@/app/actions";
import type { ActionErrorCode } from "@/lib/types";

import type { SyncController } from "./sync-status";
import { alertBackdrop, alertContent, dangerAnswer, dialogContent, primaryAnswer, quietAnswer } from "./styles";

export const createConnectXController = () => createDialogController();
export type ConnectXController = ReturnType<typeof createConnectXController>;

const CONNECTED_PAUSE_MS = 1_200;

/** Where pasted cookies end up, by the recorded secret backend. */
const KEPT = { keychain: "in your keychain on this machine", file: "in an owner-only file on this machine", unknown: "on this machine" };

type Failure = { code: ActionErrorCode; message: string };

/** What each refusal says in the dialog: what went wrong and what to do next. */
function failureText({ code, message }: Failure): string {
  switch (code) {
    case "x_rejected":
      return "X didn't accept these cookies. Copy fresh ones from a tab where you're signed in to x.com.";
    case "x_unreachable":
      return "X couldn't be reached. Check your connection and try again.";
    case "secret_store_locked":
      return "Can't reach the keychain. Unlock it, then try again.";
    case "invalid_input":
      return message;
    default:
      return "The cookies could not be saved. Try again.";
  }
}

/** Which field an `invalid_input` message is about: the server names the field first. */
const fieldOf = (failure: Failure | null): "auth_token" | "ct0" | null => {
  if (failure?.code !== "invalid_input") return null;
  if (failure.message.startsWith("auth_token")) return "auth_token";
  if (failure.message.startsWith("ct0")) return "ct0";
  return null;
};

function CookieField({ name, value, onChange, error }: { name: string; value: string; onChange: (value: string) => void; error: string | null }) {
  return (
    <Field name={name} invalid={error ? true : undefined}>
      <FieldLabel className="font-mono text-[13px] text-ink">{name}</FieldLabel>
      <PasswordInput
        required
        autoComplete="off"
        value={value}
        onValueChange={onChange}
        className="h-10 rounded-full pl-4 text-[16px] transition-shadow duration-150 ease-out has-[input:focus-visible]:shadow-[0_0_0_1px_var(--color-primary)] sm:text-[14px]"
      >
        <PasswordInputControl spellCheck={false} />
        <PasswordInputToggle aria-label={`Show ${name}`} className="focus-ring size-8 cursor-pointer rounded-full border-0 bg-transparent text-ink-muted hover:bg-sunken">
          {(state) => (state.visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />)}
        </PasswordInputToggle>
      </PasswordInput>
      {error ? (
        <FieldError match role="alert" className="text-[13px] text-like-text">
          {error}
        </FieldError>
      ) : null}
    </Field>
  );
}

function ConnectForm({ sync, onDone }: { sync: SyncController; onDone: () => void }) {
  const [authToken, setAuthToken] = useState("");
  const [ct0, setCt0] = useState("");
  const [failure, setFailure] = useState<Failure | null>(null);
  const [connectedAs, setConnectedAs] = useState<string | null>(null);
  const [checking, startChecking] = useTransition();
  const { connection, handle, secretBackend } = sync.state;
  const replacing = connection !== "not_connected";
  const success = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (connectedAs === null) return;
    // The submit button is gone; keep focus in the dialog until it closes.
    success.current?.focus();
    const timer = setTimeout(onDone, CONNECTED_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [connectedAs, onDone]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);
    startChecking(async () => {
      try {
        const result = await connectX(authToken, ct0);
        if (!result.ok) {
          setFailure({ code: result.code, message: result.message });
          return;
        }
        sync.update(result.sync);
        setConnectedAs(result.handle ? `Connected as @${result.handle}` : "Connected");
      } catch {
        setFailure({ code: "failed", message: "" });
      }
    });
  };

  if (connectedAs !== null) {
    return (
      <div ref={success} tabIndex={-1} role="status" className="flex items-center gap-3 p-5 outline-none">
        <CircleCheck className="size-5 shrink-0 text-primary" aria-hidden="true" />
        <DialogTitle className="text-display text-[20px]">{connectedAs}</DialogTitle>
      </div>
    );
  }

  const field = fieldOf(failure);
  const formError = failure !== null && field === null ? failureText(failure) : null;
  return (
    <form onSubmit={submit} className="flex flex-col gap-4 p-5">
      <div>
        <DialogTitle className="text-display text-[20px]">{replacing ? "X connection" : "Connect X"}</DialogTitle>
        <DialogDescription className="mt-1.5 text-[13px] leading-[1.5] text-pretty text-ink-muted">
          {connection === "needs_reconnect"
            ? "X stopped accepting the saved cookies. Paste fresh ones to start syncing again. "
            : connection === "connected"
              ? `${handle ? `Connected as @${handle}. ` : "Connected. "}Paste new cookies to replace the saved ones. `
              : `Syncing uses your X session cookies. They're checked with X, then kept ${KEPT[secretBackend ?? "unknown"]}. `}
          To copy them, open dev tools in a tab signed in to x.com, then Application, then Cookies, then x.com.
        </DialogDescription>
      </div>
      <fieldset disabled={checking} className="m-0 flex flex-col gap-3 border-0 p-0">
        <CookieField name="auth_token" value={authToken} onChange={setAuthToken} error={field === "auth_token" ? failure?.message ?? null : null} />
        <CookieField name="ct0" value={ct0} onChange={setCt0} error={field === "ct0" ? failure?.message ?? null : null} />
      </fieldset>
      {formError ? (
        <p role="alert" className="text-[13px] leading-snug text-like-text">
          {formError}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        {replacing ? <DisconnectButton sync={sync} onDone={onDone} /> : null}
        <DialogClose type="button" className={`${quietAnswer} ml-auto`}>
          Cancel
        </DialogClose>
        <button type="submit" disabled={checking || authToken === "" || ct0 === ""} className={primaryAnswer}>
          {checking ? "Checking with X…" : replacing ? "Replace" : "Connect"}
        </button>
      </div>
    </form>
  );
}

function DisconnectButton({ sync, onDone }: { sync: SyncController; onDone: () => void }) {
  return (
    <AlertDialog pendingAnnouncement="Disconnecting">
      <AlertDialogTrigger className={`${quietAnswer} text-like-text`}>Disconnect</AlertDialogTrigger>
      <AlertDialogBackdrop className={alertBackdrop} />
      <AlertDialogContent className={alertContent}>
        <AlertDialogTitle className="text-display text-[20px]">Disconnect X?</AlertDialogTitle>
        <AlertDialogDescription className="mt-2 text-[14px] leading-[1.55] text-pretty text-ink-muted">
          The saved cookies are deleted from this machine and syncing stops. Posts already synced stay here.
        </AlertDialogDescription>
        <AlertDialogClose
          value="confirm"
          action={async () => {
            const result = await disconnectX();
            if (!result.ok) throw new Error(result.code === "secret_store_locked" ? "Can't reach the keychain. Unlock it, then try again." : result.message);
            sync.update(result.sync);
            onDone();
          }}
          render={(props, state) => (
            <div className="mt-5 flex flex-col gap-3">
              {state.error instanceof Error ? (
                <p role="alert" className="text-[13px] leading-snug text-like-text">
                  {state.error.message}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <AlertDialogClose className={quietAnswer}>Cancel</AlertDialogClose>
                <button {...props} className={dangerAnswer}>
                  {state.pending ? "Disconnecting…" : "Disconnect"}
                </button>
              </div>
            </div>
          )}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** The sync panel's action in the sidebar on screen: what replaces the trigger once X is connected or disconnected. */
function visibleSyncAction(): HTMLElement | null {
  const actions = document.querySelectorAll<HTMLElement>("[data-sync-action]");
  return Array.from(actions).find((action) => action.offsetParent !== null) ?? null;
}

/** Connects X from pasted cookies; when connected, replaces them or disconnects. */
export function ConnectXDialog({ controller, sync }: { controller: ConnectXController; sync: SyncController }) {
  const opener = useRef<Element | null>(null);
  return (
    <Dialog
      controller={controller}
      onOpenChange={(open) => {
        if (open) opener.current = document.activeElement;
      }}
    >
      <DialogBackdrop className={alertBackdrop} />
      <DialogContent
        // Back to the control that opened it, or, when connecting or disconnecting replaced it, to the panel's new action.
        finalFocus={() => (opener.current instanceof HTMLElement && opener.current.isConnected ? opener.current : visibleSyncAction())}
        className={`w-[min(28rem,calc(100%-1.5rem))] ${dialogContent}`}
      >
        <ConnectForm sync={sync} onDone={() => controller.close()} />
      </DialogContent>
    </Dialog>
  );
}
