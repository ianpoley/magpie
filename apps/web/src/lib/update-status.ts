import { homedir } from "node:os";
import { resolve } from "node:path";

import { engineConfig, engineUpdate } from "./engine.ts";
import { errorName } from "./error-name.ts";

export type UpdateState =
  | { kind: "release"; installed: string | null; latest: string; url: string; autoApplies: boolean; command: string }
  | { kind: "applying"; startedAt: string }
  | { kind: "failed"; log: string; command: string }
  | { kind: "pending"; command: string };

let checked: { at: number; state: Promise<UpdateState | null> } | null = null;

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
    const [root, { updateStatus }] = await Promise.all([codeRootPath(), engineUpdate()]);
    const status = await updateStatus(root);
    return status && { kind: "release", ...status, command: releaseCommand(root, status.autoApplies) };
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
