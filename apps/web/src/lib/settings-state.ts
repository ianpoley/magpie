import { engineConfig, engineFocus, engineSkillLink } from "./engine.ts";
import { readJevKeyStored, readSyncFiles } from "./sync-state.ts";
import type { FocusState, SettingsState } from "./types.ts";

export async function loadFocus(): Promise<FocusState> {
  const [{ readFocus }, { paths }] = await Promise.all([engineFocus(), engineConfig()]);
  return readFocus(paths());
}

export async function readSettings(): Promise<SettingsState> {
  const [focus, { skillLinkState }, { workerAlive }, jevKeyStored] = await Promise.all([
    loadFocus(),
    engineSkillLink(),
    readSyncFiles(),
    readJevKeyStored(),
  ]);
  return { focus, skillLink: skillLinkState(), workerAlive, jevKeyStored };
}
