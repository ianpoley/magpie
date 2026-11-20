import type { ClaudeAdapter, ClaudeFailure, ClaudeRequest } from '../../src/claude/cli.ts';
import type { HttpFetch } from '../../src/links/http.ts';
import type { PipelineDeps } from '../../src/pipeline.ts';
import { fakeJev } from './corpus.ts';
import type { FakeJev } from './corpus.ts';

export type Fakes = PipelineDeps & {
  jev: FakeJev;
  httpCalls: string[];
  claudeCalls: ClaudeRequest[];
};

const claudeDown: ClaudeFailure = { ok: false, reason: 'missing', message: 'The CLI is not installed.' };

export function fakes(options: { claude?: 'answers' | 'down'; jev?: FakeJev } = {}): Fakes {
  const httpCalls: string[] = [];
  const claudeCalls: ClaudeRequest[] = [];
  const http: HttpFetch = async ({ url }) => {
    httpCalls.push(url);
    return {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: `<!doctype html><html><head><title>Page at ${url}</title></head><body></body></html>`,
    };
  };
  const claude: ClaudeAdapter = {
    send: async (request) => {
      claudeCalls.push(request);
      if (options.claude === 'down') return claudeDown;
      const wantsFinalList = request.schema.type === 'object' && 'areas' in request.schema.properties;
      const value = wantsFinalList
        ? {
            areas: [
              {
                name: 'Frontend',
                dev: true,
                topics: [
                  { name: 'Animations', definition: 'Posts about motion on the web.' },
                  { name: 'Layout', definition: 'Posts about arranging a page.' },
                ],
              },
            ],
          }
        : {
            topics: [
              { name: 'Animations', area: 'Frontend', definition: 'Posts about motion on the web.' },
              { name: 'Layout', area: 'Frontend', definition: 'Posts about arranging a page.' },
            ],
          };
      return { ok: true, value, session: null };
    },
  };
  const lookup = async () => ['93.184.216.34'];
  return { http, lookup, claude, jev: options.jev ?? fakeJev(() => 0.9), httpCalls, claudeCalls };
}
