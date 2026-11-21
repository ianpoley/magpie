import { AuthenticationError, PermissionDeniedError, TypeSafeClient } from '@typesafe-ai/sdk';
import type { SystemOneRequest } from '@typesafe-ai/sdk';

import { paths } from '../config.ts';
import { createSecretStore } from '../secrets/store.ts';

export type JevQuestion = {
  instructions: string | Record<string, unknown>;
  criteria?: { true: string; false: string };
};

export type JevRequest = {
  state: string | Record<string, unknown>;
  questions: Record<string, JevQuestion>;
};

export interface JevClient {
  ask(request: JevRequest, options?: { signal?: AbortSignal }): Promise<Record<string, number>>;
}

const KEY_NAME = 'TYPESAFE_API_KEY';

export async function checkJevKey(apiKey: string): Promise<{ ok: true } | { ok: false; reason: 'rejected' | 'unreachable' }> {
  try {
    await new TypeSafeClient({ apiKey, retry: { maxRetries: 0 }, timeout: 10_000 }).models.list();
    return { ok: true };
  } catch (error) {
    const rejected = error instanceof AuthenticationError || error instanceof PermissionDeniedError;
    return { ok: false, reason: rejected ? 'rejected' : 'unreachable' };
  }
}

export async function createJevClient(options: { apiKey?: string } = {}): Promise<JevClient> {
  let apiKey = options.apiKey;
  if (!apiKey) {
    const read = await createSecretStore().get('typesafe-api-key');
    if (!read.ok) throw new Error(`${KEY_NAME} could not be read: ${read.message}`);
    apiKey = read.value ?? undefined;
  }
  if (!apiKey) {
    throw new Error(`${KEY_NAME} is not set in the secret store, the environment or ${paths().secrets}`);
  }
  const client = new TypeSafeClient({ apiKey });

  return {
    async ask(request, options) {
      const questions: SystemOneRequest['questions'] = {};
      for (const [id, question] of Object.entries(request.questions)) {
        questions[id] = { type: 'noul', ...question } as SystemOneRequest['questions'][string];
      }
      const response = await client.systemOne(
        { state: request.state as SystemOneRequest['state'], questions },
        { signal: options?.signal },
      );
      const answers: Record<string, number> = {};
      for (const id of Object.keys(request.questions)) {
        const answer = (response.answers as Record<string, { noul?: unknown } | undefined>)[id];
        const probability = answer?.noul;
        if (typeof probability !== 'number' || !(probability >= 0 && probability <= 1)) {
          throw new Error(`Jev returned no probability for question ${id}`);
        }
        answers[id] = probability;
      }
      return answers;
    },
  };
}
