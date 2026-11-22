import { engineFocus, engineSkillLink } from "./engine.ts";
import { readJevKeyStored } from "./sync-state.ts";
import type { FocusState, SettingsState } from "./types.ts";

export async function loadFocus(): Promise<FocusState> {
  const { readFocus } = await engineFocus();
  return readFocus();
}

export async function readSettings(): Promise<SettingsState> {
  const [focus, { skillLinkState }, jevKeyStored] = await Promise.all([loadFocus(), engineSkillLink(), readJevKeyStored()]);
  return { focus, skillLink: skillLinkState(), jevKeyStored };
}
