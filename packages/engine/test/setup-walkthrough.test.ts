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
  asked: string[];
  did: string[];
  lines: string[];
};

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
  oldLogs?: { count: number; bytes: number; dir: string };
  answer?: (question: string) => boolean;
}): Machine {
  const asked: string[] = [];
  const did: string[] = [];
  const lines: string[] = [];
  let services: ServicesState = { installed: false, running: false, dataRoot: null, here: '/clone', ...state.services };
  let connected = state.connected ?? false;
  let jev = state.jev ?? false;
  let skill: SkillState = state.skill ?? 'missing';
  let logs = state.oldLogs ?? { count: 0, bytes: 0, dir: '/clone/logs' };
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
      services = { ...services, installed: true, running: true, dataRoot: services.here, upgradeSafeNode: null, buildBehindCode: false };
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
    oldLogs: () => logs,
    deleteOldLogs: () => {
      did.push('delete logs');
      logs = { count: 0, bytes: 0, dir: logs.dir };
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

test('running services pinned to a Node path Homebrew deletes are reinstalled on yes, and listed to do on no', async () => {
  const pinned = { installed: true, running: true, dataRoot: '/clone', upgradeSafeNode: '/opt/homebrew/opt/node/bin/node' };
  const yes = machine({ services: pinned, connected: true, jev: true, skill: 'linked' });
  const fixed = await walkthrough(yes.deps);
  assert.deepEqual(yes.did, ['install']);
  assert.deepEqual(fixed.todo, []);

  const no = machine({ services: pinned, connected: true, jev: true, skill: 'linked', answer: () => false });
  const left = await walkthrough(no.deps);
  assert.deepEqual(no.did, []);
  assert.ok(left.todo.some((line) => line.includes('bun run service:install')));
});

test('running services on a build older than the code are rebuilt on yes, and listed to do on no', async () => {
  const behind = { installed: true, running: true, dataRoot: '/clone', buildBehindCode: true };
  const yes = machine({ services: behind, connected: true, jev: true, skill: 'linked' });
  assert.deepEqual((await walkthrough(yes.deps)).todo, []);
  assert.deepEqual(yes.did, ['install']);

  const no = machine({ services: behind, connected: true, jev: true, skill: 'linked', answer: () => false });
  const left = await walkthrough(no.deps);
  assert.ok(left.todo.includes('Rebuild and restart the services on the current code: bun run service:install'));
});

test("the old nightly job's logs are deleted only on a yes at a terminal, and never while that job is installed", async () => {
  const setUp = { services: { installed: true, running: true, dataRoot: '/clone' }, connected: true, jev: true, skill: 'linked' as const };
  const oldLogs = { count: 64, bytes: 1_160_000_000, dir: '/clone/logs' };

  const asked = machine({ ...setUp, oldLogs });
  const deleted = await walkthrough(asked.deps);
  assert.deepEqual(asked.did, ['delete logs']);
  assert.ok(deleted.done.includes('Deleted 64 old nightly logs (1.2 GB).'));

  const agent = machine({ ...setUp, oldLogs, interactive: false, yes: true });
  const kept = await walkthrough(agent.deps);
  assert.deepEqual(agent.did, []);
  assert.ok(kept.todo.some((line) => line.includes('rm /clone/logs/nightly-*.log')));

  const legacy = machine({ ...setUp, oldLogs, legacy: '/Library/LaunchAgents/old.plist', answer: () => false });
  await walkthrough(legacy.deps);
  assert.ok(!legacy.did.includes('delete logs'));
  assert.ok(!legacy.asked.includes('Delete them?'));
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
  assert.ok(result.todo.some((line) => line.startsWith('Rename the install from x-corpus to magpie: bun run service:install.')));
});
