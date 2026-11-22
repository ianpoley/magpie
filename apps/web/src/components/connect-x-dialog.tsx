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
import { CircleCheck } from "lucide-react";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";

import { connectX, disconnectX } from "@/app/actions";
import type { ActionErrorCode, FormField } from "@/lib/types";

import { SecretField } from "./secret-field";
import type { SyncController } from "./sync-status";
import { alertBackdrop, alertContent, dangerAnswer, dialogContent, primaryAnswer, quietAnswer } from "./styles";

export const createConnectXController = () => createDialogController();
export type ConnectXController = ReturnType<typeof createConnectXController>;

const CONNECTED_PAUSE_MS = 1_200;

export const KEPT = { keychain: "in your keychain on this machine", file: "in an owner-only file on this machine", unknown: "on this machine" };

type Failure = { code: ActionErrorCode; message: string; field?: FormField };

function failureText({ code, message }: Failure): string {
  switch (code) {
    case "x_rejected":
    case "x_unreachable":
    case "secret_store_locked":
    case "invalid_input":
      return message;
    default:
      return "The cookies could not be saved. Try again.";
  }
}

const fieldOf = (failure: Failure | null): "auth_token" | "ct0" | null =>
  failure?.field === "auth_token" || failure?.field === "ct0" ? failure.field : null;

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
          setFailure({ code: result.code, message: result.message, field: result.field });
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
        <SecretField name="auth_token" value={authToken} onChange={setAuthToken} error={field === "auth_token" ? failure?.message ?? null : null} />
        <SecretField name="ct0" value={ct0} onChange={setCt0} error={field === "ct0" ? failure?.message ?? null : null} />
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
        <p className="mt-2 text-[13px] leading-[1.55] text-pretty text-ink-muted">
          This doesn&apos;t sign the session out of X. If you think the cookies leaked, end it on x.com too: Settings and privacy, Security and account access, Apps and sessions, Sessions.
        </p>
        <AlertDialogClose
          value="confirm"
          action={async () => {
            const result = await disconnectX();
            if (!result.ok) throw new Error(result.message);
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

function visibleSyncAction(): HTMLElement | null {
  const actions = document.querySelectorAll<HTMLElement>("[data-sync-action]");
  return Array.from(actions).find((action) => action.offsetParent !== null) ?? null;
}

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
        finalFocus={() => (opener.current instanceof HTMLElement && opener.current.isConnected ? opener.current : visibleSyncAction())}
        className={`w-[min(28rem,calc(100%-1.5rem))] ${dialogContent}`}
      >
        <ConnectForm sync={sync} onDone={() => controller.close()} />
      </DialogContent>
    </Dialog>
  );
}
