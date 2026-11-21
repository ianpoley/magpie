import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { SetupCheck } from '../src/service/index.ts';
import { walkthrough } from '../src/setup/walkthrough.ts';
import type { ServicesState, SkillState, WalkthroughDeps } from '../src/setup/walkthrough.ts';

const OK_CHECKS: SetupCheck[] = [
  { name: 'node', level: 'ok', detail: 'Node v26.5.0' },
  { name: 'claude', level: 'ok', detail: 'Claude CLI' },
];

type Machine = {
  deps: WalkthroughDeps;
  /** Every question asked, and every step taken, in order. */
  asked: string[];
  did: string[];
  lines: string[];
};

/**
 * A machine in some state, with every answer `answer` gives (yes by default).
 * The fakes change the state the way the real steps would.
 */
function machine(state: {
  interactive?: boolean;
  yes?: boolean;
  checks?: SetupCheck[];
  worktreeOf?: string | null;
  legacy?: string | null;
  services?: Partial<ServicesState>;
  connected?: boolean;
  connectsWhenOpened?: boolean;
  jev?: boolean;
  jevTyped?: string;
  skill?: SkillState;
  answer?: (question: string) => boolean;
}): Machine {
  const asked: string[] = [];
  const did: string[] = [];
  const lines: string[] = [];
  let services: ServicesState = { installed: false, running: false, dataRoot: null, here: '/clone', ...state.services };
  let connected = state.connected ?? false;
  let jev = state.jev ?? false;
  let skill: SkillState = state.skill ?? 'missing';
  const deps: WalkthroughDeps = {
    interactive: state.interactive ?? true,
    yes: state.yes ?? false,
    log: (line) => lines.push(line),
    confirm: async (question) => {
      asked.push(question.trim());
      return (state.answer ?? (() => true))(question);
    },
    secret: async (prompt) => {
      asked.push(prompt.trim());
      return state.jevTyped ?? '';
    },
    checks: async () => state.checks ?? OK_CHECKS,
    worktreeOf: state.worktreeOf ?? null,
    legacy: state.legacy ?? null,
    services: async () => services,
    install: async () => {
      did.push('install');
      services = { ...services, installed: true, running: true, dataRoot: services.here };
    },
    migrate: async () => {
      did.push('migrate');
      return { ok: true, message: '' };
    },
    connection: () => (connected ? { handle: 'someone' } : undefined),
    appUrl: 'http://127.0.0.1:3030',
    openApp: async () => {
      did.push('open');
    },
    waitForConnection: async () => {
      if (!state.connectsWhenOpened) return undefined;
      connected = true;
      return { handle: 'someone' };
    },
    jevStored: async () => jev,
    storeJev: async () => {
      did.push('jev');
      jev = true;
      return { ok: true, message: 'in the OS secret store' };
    },
    skill: () => skill,
    linkSkill: async () => {
      did.push('skill');
      skill = 'linked';
    },
  };
  return { deps, asked, did, lines };
}

test('a fresh machine at a terminal: installs, opens the app to connect, stores the Jev key and links the skill', async () => {
  const m = machine({ connectsWhenOpened: true, jevTyped: 'jev-key' });
  const result = await walkthrough(m.deps);
  assert.equal(result.ok, true);
  assert.deepEqual(m.did, ['install', 'open', 'jev', 'skill']);
  assert.deepEqual(result.todo, []);
  assert.ok(m.lines.includes('All set. Open http://127.0.0.1:3030'));
});

test('a machine that is already set up asks nothing and does nothing', async () => {
  const m = machine({
    services: { installed: true, running: true, dataRoot: '/clone' },
    connected: true,
    jev: true,
    skill: 'linked',
  });
  const result = await walkthrough(m.deps);
  assert.deepEqual(m.asked, []);
  assert.deepEqual(m.did, []);
  assert.deepEqual(result.todo, []);
  assert.equal(result.done.length, 4);
});

test('declined and skipped steps end up on the still-to-do list with the command for each', async () => {
  const m = machine({ answer: () => false });
  const result = await walkthrough(m.deps);
  assert.deepEqual(m.did, []);
  assert.deepEqual(m.asked, ['Install them now?', 'Jev key (typing is hidden; press Enter to skip):', 'Link it into ~/.claude/skills?']);
  assert.ok(result.todo.some((line) => line.includes('bun run service:install')));
  assert.ok(result.todo.some((line) => line.includes('Connect X once the web app runs')));
  assert.ok(result.todo.some((line) => line.includes('bun run secrets:set-jev')));
  assert.ok(result.todo.some((line) => line.includes('packages/skill/install.sh')));
});

test('without a terminal nothing is asked or done, and every step is reported', async () => {
  const m = machine({ interactive: false });
  const result = await walkthrough(m.deps);
  assert.deepEqual(m.asked, []);
  assert.deepEqual(m.did, []);
  assert.equal(result.ok, true);
  assert.equal(result.todo.length, 4);
});

test('--yes without a terminal installs the services and links the skill, and never asks for or stores a secret', async () => {
  const m = machine({ interactive: false, yes: true });
  const result = await walkthrough(m.deps);
  assert.deepEqual(m.asked, []);
  assert.deepEqual(m.did, ['install', 'skill']);
  assert.ok(result.todo.some((line) => line.includes('never paste them into an agent chat')));
  assert.ok(result.todo.some((line) => line.includes('bun run secrets:set-jev')));
});

test('--yes stops at services that belong to another clone and at an existing skill link', async () => {
  const m = machine({
    interactive: false,
    yes: true,
    services: { installed: true, running: true, dataRoot: '/other-clone' },
    skill: 'elsewhere',
  });
  const result = await walkthrough(m.deps);
  assert.deepEqual(m.did, []);
  assert.ok(result.done.includes('Left the services on /other-clone.'));
  assert.ok(result.done.includes('Left the existing magpie skill as it is.'));
});

test('at a terminal, services for another clone are moved here only on an explicit yes, which defaults to no', async () => {
  const defaults: boolean[] = [];
  const m = machine({ services: { installed: true, running: true, dataRoot: '/other-clone' }, connected: true, jev: true, skill: 'linked' });
  m.deps.confirm = async (question, defaultYes) => {
    defaults.push(defaultYes);
    return true;
  };
  await walkthrough(m.deps);
  assert.deepEqual(defaults, [false]);
  assert.deepEqual(m.did, ['install']);
});

test('the old nightly job is migrated only on an explicit yes at a terminal; --yes leaves it and says to migrate', async () => {
  const atTerminal = machine({ legacy: '/home/someone/Library/LaunchAgents/old.plist', connected: true, jev: true, skill: 'linked' });
  await walkthrough(atTerminal.deps);
  assert.deepEqual(atTerminal.did, ['migrate']);
  assert.match(atTerminal.asked[0], /Migrate now\?/);

  const agent = machine({ interactive: false, yes: true, legacy: '/home/someone/Library/LaunchAgents/old.plist', skill: 'linked' });
  const result = await walkthrough(agent.deps);
  assert.deepEqual(agent.did, []);
  assert.ok(result.todo.includes('Move off the old nightly job: bun run migrate'));
});

test('in a worktree it only reports on the main checkout and changes nothing', async () => {
  const m = machine({ worktreeOf: '/main', services: { installed: true, running: true, dataRoot: '/main', here: '/main' }, connected: true });
  const result = await walkthrough(m.deps);
  assert.deepEqual(m.asked, []);
  assert.deepEqual(m.did, []);
  assert.deepEqual(result.done, ['Background sync runs from /main.', 'X is connected as @someone.']);
  assert.deepEqual(result.todo, []);
});

test('a failed check stops before any step and fails the run', async () => {
  const m = machine({ checks: [{ name: 'node', level: 'fail', detail: 'needs Node >=25.8.1 <27' }] });
  const result = await walkthrough(m.deps);
  assert.equal(result.ok, false);
  assert.deepEqual(m.did, []);
  assert.deepEqual(result.todo, ['Fix node: needs Node >=25.8.1 <27', 'Then run bun run setup again.']);
});

test('a failed install is reported and does not offer to connect X', async () => {
  const m = machine({ jev: true, skill: 'linked' });
  m.deps.install = async () => {
    throw new Error('the web app build failed (exit 1).');
  };
  const result = await walkthrough(m.deps);
  assert.ok(result.todo.some((line) => line.includes('the web app build failed')));
  assert.ok(result.todo.some((line) => line.includes('Connect X once the web app runs')));
  assert.ok(!m.asked.some((question) => question.includes('Open the web app')));
});

test('an install still under the x-corpus names is renamed only when asked at a terminal; --yes leaves it and says how', async () => {
  const legacy = { installed: false, running: false, dataRoot: '/clone', legacy: true };
  const atTerminal = machine({ services: legacy, connected: true, jev: true, skill: 'linked' });
  await walkthrough(atTerminal.deps);
  assert.deepEqual(atTerminal.asked, ['Rename and reinstall now?']);
  assert.deepEqual(atTerminal.did, ['install']);

  const agent = machine({ interactive: false, yes: true, services: legacy, connected: true, jev: true, skill: 'linked' });
  const result = await walkthrough(agent.deps);
  assert.deepEqual(agent.did, []);
  assert.ok(result.todo.includes('Rename the install from x-corpus to magpie: bun run service:install'));
});
