import { TypeSafeClient } from '@typesafe-ai/sdk';
import type { SystemOneRequest } from '@typesafe-ai/sdk';

import { paths } from '../config.ts';
import { createSecretStore } from '../secrets/store.ts';

/** A yes/no question; the answer is the probability that it is true. */
export type JevQuestion = {
  instructions: string | Record<string, unknown>;
  criteria?: { true: string; false: string };
};

export type JevRequest = {
  state: string | Record<string, unknown>;
  questions: Record<string, JevQuestion>;
};

export interface JevClient {
  /**
   * Resolves to one probability (0 to 1) per question id. Rejects when the
   * request fails or any answer is missing, so a failure is never read as "no".
   */
  ask(request: JevRequest, options?: { signal?: AbortSignal }): Promise<Record<string, number>>;
}

const KEY_NAME = 'TYPESAFE_API_KEY';

/**
 * The client that calls the live API. The key comes from `options.apiKey`,
 * else the secret store. Rejects when the key is not set or the store cannot
 * be read.
 */
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
