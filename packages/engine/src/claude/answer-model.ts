import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { CLAUDE, paths } from '../config.ts';
import type { Paths } from '../config.ts';
import { readJsonObject, updateJson } from '../sync/state.ts';
import type { ClaudeModelChoice } from './cli.ts';

export const ANSWER_MODELS = [
  { id: 'claude-opus-5-5', label: 'Opus 5.5' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5' },
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5' },
  { id: 'claude-fable-5-2', label: 'Fable 5.2' },
] as const;

export const ANSWER_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

export type AnswerModelId = (typeof ANSWER_MODELS)[number]['id'];
export type AnswerEffort = (typeof ANSWER_EFFORTS)[number];
export type AnswerModelChoice = ClaudeModelChoice & { model: AnswerModelId; effort: AnswerEffort };

export const DEFAULT_ANSWER_MODEL: AnswerModelChoice = { model: CLAUDE.model, effort: CLAUDE.effort };

export const isAnswerModel = (value: unknown): value is AnswerModelId => ANSWER_MODELS.some((model) => model.id === value);
export const isAnswerEffort = (value: unknown): value is AnswerEffort => ANSWER_EFFORTS.some((effort) => effort === value);

export const answerModelLabel = (id: AnswerModelId): string => ANSWER_MODELS.find((model) => model.id === id)?.label ?? id;

export function readAnswerModel(files: Pick<Paths, 'answerModel'> = paths()): AnswerModelChoice {
  const saved = readJsonObject(files.answerModel);
  return {
    model: isAnswerModel(saved.model) ? saved.model : DEFAULT_ANSWER_MODEL.model,
    effort: isAnswerEffort(saved.effort) ? saved.effort : DEFAULT_ANSWER_MODEL.effort,
  };
}

export function writeAnswerModel(path: string, choice: { model: unknown; effort: unknown }): AnswerModelChoice {
  if (!isAnswerModel(choice.model)) throw new Error(`Answers cannot use the model ${JSON.stringify(choice.model)}.`);
  if (!isAnswerEffort(choice.effort)) throw new Error(`Effort must be one of ${ANSWER_EFFORTS.join(', ')}, not ${JSON.stringify(choice.effort)}.`);
  const saved = { model: choice.model, effort: choice.effort };
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  updateJson(path, () => saved);
  return saved;
}
