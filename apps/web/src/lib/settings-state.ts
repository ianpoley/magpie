import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

import { engineAnswerModel, engineFocus, engineSkillLink } from "./engine.ts";
import { readJevKeyStored } from "./sync-state.ts";
import type { FocusState, SettingsState } from "./types.ts";

export async function loadFocus(): Promise<FocusState> {
  const { readFocus } = await engineFocus();
  return readFocus();
}

function skillLinkTarget(): string | null {
  try {
    const target = realpathSync(join(homedir(), ".claude", "skills", "magpie"));
    return basename(target) === "skill" && basename(dirname(target)) === "packages" ? dirname(dirname(target)) : target;
  } catch {
    return null;
  }
}

export async function readSettings(): Promise<SettingsState> {
  const [focus, { skillLinkState }, jevKeyStored, { readAnswerModel, ANSWER_MODELS, ANSWER_EFFORTS }] = await Promise.all([
    loadFocus(),
    engineSkillLink(),
    readJevKeyStored(),
    engineAnswerModel(),
  ]);
  return { focus, skillLink: skillLinkState(), skillTarget: skillLinkTarget(), jevKeyStored, answerModel: { ...readAnswerModel(), models: ANSWER_MODELS, efforts: ANSWER_EFFORTS } };
}
