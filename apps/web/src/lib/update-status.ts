import { homedir } from "node:os";
import { resolve } from "node:path";

import { engineConfig, engineUpdate } from "./engine.ts";
import { errorName } from "./error-name.ts";

export type UpdateState = { installed: string | null; latest: string; url: string; command: string };

let checked: { at: number; state: Promise<UpdateState | null> } | null = null;

export const shellPath = (dir: string, home = homedir()): string => {
  const shown = dir === home || dir.startsWith(`${home}/`) ? `~${dir.slice(home.length)}` : dir;
  return /^[\w~./-]+$/.test(shown) ? shown : `'${dir.replaceAll("'", `'\\''`)}'`;
};

async function checkForUpdate(): Promise<UpdateState | null> {
  try {
    const [{ codeRoot }, { updateStatus }] = await Promise.all([engineConfig(), engineUpdate()]);
    const root = resolve(codeRoot());
    const status = await updateStatus(root);
    return status && { ...status, command: `cd ${shellPath(root)} && git pull && bun run setup` };
  } catch (error) {
    console.error("update check failed:", errorName(error));
    return null;
  }
}

export async function readUpdateState(now = Date.now()): Promise<UpdateState | null> {
  const { RELEASES } = await engineConfig();
  if (checked === null || now - checked.at >= RELEASES.checkEveryMs) checked = { at: now, state: checkForUpdate() };
  return checked.state;
}
