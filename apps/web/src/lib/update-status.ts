import { homedir } from "node:os";
import { resolve } from "node:path";

import { engineConfig, engineUpdate } from "./engine.ts";
import { errorName } from "./error-name.ts";

export type UpdateState =
  | { kind: "release"; installed: string | null; latest: string; url: string; autoApplies: boolean; pullable: boolean; command: string }
  | { kind: "applying"; startedAt: string }
  | { kind: "failed"; log: string; command: string }
  | { kind: "pending"; command: string };

export type PullOutcome = { ok: true; state: UpdateState | null } | { ok: false; reason: string };

const SETTLE_POLL_MS = 250;
const SETTLE_POLLS = 12;

let checked: { at: number; state: Promise<UpdateState | null> } | null = null;
let pulling: Promise<PullOutcome> | null = null;

export const shellPath = (dir: string, home = homedir()): string => {
  const shown = dir === home || dir.startsWith(`${home}/`) ? `~${dir.slice(home.length)}` : dir;
  return /^[\w~./-]+$/.test(shown) ? shown : `'${dir.replaceAll("'", `'\\''`)}'`;
};

export const releaseCommand = (root: string, autoApplies: boolean) =>
  autoApplies ? `cd ${shellPath(root)} && git pull` : `cd ${shellPath(root)} && git pull && bun run setup`;

export const applyCommand = (root: string) => `cd ${shellPath(root)} && bun run setup`;

async function codeRootPath(): Promise<string> {
  const { codeRoot } = await engineConfig();
  return resolve(codeRoot());
}

async function checkForRelease(): Promise<UpdateState | null> {
  try {
    const [root, { updateStatus, pullBlocker }] = await Promise.all([codeRootPath(), engineUpdate()]);
    const status = await updateStatus(root);
    if (status === null) return null;
    const pullable = (await pullBlocker(root)) === null;
    return { kind: "release", ...status, pullable, command: releaseCommand(root, status.autoApplies) };
  } catch (error) {
    console.error("update check failed:", errorName(error));
    return null;
  }
}

async function checkThisCheckout(): Promise<UpdateState | null> {
  try {
    const [root, { localUpdateStatus }] = await Promise.all([codeRootPath(), engineUpdate()]);
    const local = await localUpdateStatus(root);
    if (local === null || local.kind === "applying") return local;
    return { ...local, command: applyCommand(root) };
  } catch (error) {
    console.error("local update check failed:", errorName(error));
    return null;
  }
}

export async function readUpdateState(now = Date.now()): Promise<UpdateState | null> {
  const local = await checkThisCheckout();
  if (local) return local;
  const { RELEASES } = await engineConfig();
  if (checked === null || now - checked.at >= RELEASES.checkEveryMs) checked = { at: now, state: checkForRelease() };
  return checked.state;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function settledState(): Promise<UpdateState | null> {
  for (let poll = 0; poll < SETTLE_POLLS; poll++) {
    const local = await checkThisCheckout();
    if (local?.kind !== "pending") return local ?? readUpdateState();
    await sleep(SETTLE_POLL_MS);
  }
  return checkThisCheckout();
}

async function runPull(): Promise<PullOutcome> {
  try {
    const [root, { pullRelease }] = await Promise.all([codeRootPath(), engineUpdate()]);
    const pulled = await pullRelease(root);
    if (!pulled.ok) return pulled;
    checked = null;
    return { ok: true, state: await settledState() };
  } catch (error) {
    console.error("update pull failed:", errorName(error));
    return { ok: false, reason: "the pull could not start" };
  }
}

export function pullUpdate(): Promise<PullOutcome> {
  pulling ??= runPull().finally(() => {
    pulling = null;
  });
  return pulling;
}
