import { engineAnswerModel, engineFocus, engineSkillLink } from "./engine.ts";
import { readJevKeyStored } from "./sync-state.ts";
import type { FocusState, SettingsState } from "./types.ts";

export async function loadFocus(): Promise<FocusState> {
  const { readFocus } = await engineFocus();
  return readFocus();
}

export async function readSettings(): Promise<SettingsState> {
  const [focus, { skillLinkState }, jevKeyStored, { readAnswerModel, ANSWER_MODELS, ANSWER_EFFORTS }] = await Promise.all([
    loadFocus(),
    engineSkillLink(),
    readJevKeyStored(),
    engineAnswerModel(),
  ]);
  return { focus, skillLink: skillLinkState(), jevKeyStored, answerModel: { ...readAnswerModel(), models: ANSWER_MODELS, efforts: ANSWER_EFFORTS } };
}
