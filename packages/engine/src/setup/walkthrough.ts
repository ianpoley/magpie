import type { SetupCheck } from '../service/index.ts';

export type WalkthroughDeps = {
  interactive: boolean;
  yes: boolean;
  log: (line: string) => void;
  confirm: (question: string, defaultYes: boolean) => Promise<boolean>;
  secret: (prompt: string) => Promise<string>;
  checks: () => Promise<SetupCheck[]>;
  worktreeOf: string | null;
  legacy: string | null;
  services: () => Promise<ServicesState>;
  install: () => Promise<void>;
  migrate: () => Promise<{ ok: boolean; message: string }>;
  connection: () => { handle: string | null } | undefined;
  appUrl: string;
  openApp: (url: string) => Promise<void>;
  waitForConnection: () => Promise<{ handle: string | null } | undefined>;
  jevStored: () => Promise<boolean>;
  storeJev: (key: string) => Promise<{ ok: boolean; message: string }>;
  skill: () => SkillState;
  linkSkill: () => Promise<void>;
};

export type ServicesState = {
  installed: boolean;
  running: boolean;
  dataRoot: string | null;
  here: string;
  legacy?: boolean;
};

export type SkillState = 'linked' | 'elsewhere' | 'missing' | 'none';

export type WalkthroughResult = { ok: boolean; done: string[]; todo: string[] };

const at = (handle: string | null) => (handle ? ` as @${handle}` : '');

export async function walkthrough(deps: WalkthroughDeps): Promise<WalkthroughResult> {
  const { log } = deps;
  const done: string[] = [];
  const todo: string[] = [];
  const agree = async (question: string, options: { defaultYes: boolean; safe: boolean }) => {
    if (deps.interactive) return deps.confirm(question, options.defaultYes);
    return deps.yes && options.safe;
  };

  log('Checking this machine');
  const checks = await deps.checks();
  for (const check of checks) log(`  ${check.level.padEnd(4)}  ${check.name.padEnd(12)}  ${check.detail}`);
  const failed = checks.filter((check) => check.level === 'fail');
  if (failed.length > 0) {
    for (const check of failed) todo.push(`Fix ${check.name}: ${check.detail}`);
    todo.push('Then run bun run setup again.');
    return finish(false);
  }
  if (checks.some((check) => check.name === 'claude' && check.level !== 'ok')) {
    todo.push('Optional, for categories: install the Claude Code CLI and log in (https://claude.com/claude-code).');
  }

  if (deps.worktreeOf) {
    const main = deps.worktreeOf;
    log('');
    log(`This is a git worktree of ${main}. It uses that checkout's corpus, services and connection.`);
    const services = await deps.services();
    if (services.running && services.dataRoot === main) done.push(`Background sync runs from ${main}.`);
    else todo.push(`Background sync is not running for ${main}: run bun run setup there.`);
    const connection = deps.connection();
    if (connection) done.push(`X is connected${at(connection.handle)}.`);
    else todo.push(`X is not connected: run bun run setup in ${main}.`);
    return finish(true);
  }

  const servicesRunning = await backgroundSync();
  await connectX(servicesRunning);
  await jevKey();
  await claudeSkill();
  return finish(true);

  async function backgroundSync(): Promise<boolean> {
    log('');
    log('Background sync and the web app');
    if (deps.legacy) {
      log(`  The old birdclaw-nightly job is still installed (${deps.legacy}).`);
      log('  Migrating moves its X cookies and Jev key into the secret store, replacing any X session stored there,');
      log('  installs the two services, and deletes the old job and its plaintext files after one good sync.');
      log('  If anything fails it puts the old job back.');
      if (!(await agree('  Migrate now?', { defaultYes: false, safe: false }))) {
        todo.push('Move off the old nightly job: bun run migrate');
        return false;
      }
      const result = await deps.migrate();
      if (!result.ok) {
        todo.push(`The migration did not complete: ${result.message}`);
        return false;
      }
      done.push('Moved off the old nightly job; background sync and the web app are running.');
      return true;
    }

    const services = await deps.services();
    if (services.legacy && (services.dataRoot === null || services.dataRoot === services.here)) {
      log('  This install still uses its old x-corpus names: the services, the keychain entries and ~/.config/x-corpus.');
      log('  Reinstalling renames them to magpie, waits for the renamed worker, and only then removes the old ones.');
      log('  If anything fails it puts the x-corpus install back.');
      if (!(await agree('  Rename and reinstall now?', { defaultYes: true, safe: false }))) {
        todo.push(
          'Rename the install from x-corpus to magpie: bun run service:install. Do it soon: the web app still runs its build from before the rename.',
        );
        return services.running;
      }
    } else if (services.dataRoot !== null && services.dataRoot !== services.here) {
      log(`  The services are installed for another clone, ${services.dataRoot}.`);
      log('  Installing here points both at this clone and its corpus instead.');
      if (!(await agree('  Point them at this clone?', { defaultYes: false, safe: false }))) {
        done.push(`Left the services on ${services.dataRoot}.`);
        return false;
      }
    } else if (services.installed && services.running) {
      done.push('Background sync and the web app are already running.');
      return true;
    } else if (services.installed) {
      log('  The services are installed but not running.');
      if (!(await agree('  Reinstall and start them?', { defaultYes: true, safe: true }))) {
        todo.push('Start the services: bun run service:install');
        return false;
      }
    } else {
      log('  Two background services: a worker that syncs every few hours, and the web app.');
      log('  Installing builds the web app first, which takes about a minute.');
      if (!(await agree('  Install them now?', { defaultYes: true, safe: true }))) {
        todo.push('Install the background services: bun run service:install');
        return false;
      }
    }
    try {
      await deps.install();
    } catch (error) {
      todo.push(`Installing the services failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
    done.push(`Background sync and the web app are running (${deps.appUrl}).`);
    return true;
  }

  async function connectX(appRunning: boolean) {
    log('');
    log('Connect X');
    const connection = deps.connection();
    if (connection) {
      done.push(`X is connected${at(connection.handle)}.`);
      return;
    }
    const howTo = `Open ${deps.appUrl} and press Connect X in the sidebar.`;
    if (!appRunning) {
      todo.push(`Connect X once the web app runs: ${howTo}`);
      return;
    }
    if (!deps.interactive) {
      todo.push(`Connect X: ${howTo} You paste your x.com auth_token and ct0 cookies there; never paste them into an agent chat.`);
      return;
    }
    log('  Magpie syncs with your X session cookies. X\'s terms do not allow this, and X could limit your account.');
    log('  In a browser signed in to x.com, open dev tools > Application > Cookies > https://x.com');
    log('  and copy auth_token and ct0. You paste them into the Connect X dialog in the web app.');
    if (!(await deps.confirm('  Open the web app to connect now?', true))) {
      todo.push(`Connect X: ${howTo}`);
      return;
    }
    await deps.openApp(deps.appUrl);
    log(`  Opened ${deps.appUrl}. Waiting for the connection; press Enter to skip.`);
    const connected = await deps.waitForConnection();
    if (connected) done.push(`X is connected${at(connected.handle)}; the first sync has started (watch it in the sidebar).`);
    else todo.push(`Connect X: ${howTo}`);
  }

  async function jevKey() {
    log('');
    log('Jev key');
    if (await deps.jevStored()) {
      done.push('The Jev key is stored.');
      return;
    }
    const later = 'Add the Jev (TypeSafe) key: bun run secrets:set-jev, or paste it into the web app, which asks for it.';
    if (!deps.interactive) {
      todo.push(later);
      return;
    }
    log('  Magpie needs a Jev (TypeSafe) API key to sort posts into topics. Skip it here and the web app asks for it.');
    const key = await deps.secret('  Jev key (typing is hidden; press Enter to skip): ');
    if (!key) {
      todo.push(later);
      return;
    }
    const stored = await deps.storeJev(key);
    if (stored.ok) done.push(`The Jev key is stored (${stored.message}).`);
    else todo.push(`The Jev key was not stored (${stored.message}). Try again: bun run secrets:set-jev`);
  }

  async function claudeSkill() {
    const state = deps.skill();
    if (state === 'none') return;
    log('');
    log('Claude skill (optional)');
    if (state === 'linked') {
      done.push('The magpie skill is linked into ~/.claude/skills.');
      return;
    }
    if (state === 'elsewhere') {
      log('  ~/.claude/skills/magpie already points at another clone or folder.');
      if (!(await agree('  Link it to this clone instead? (the old one is kept in ~/.claude/skill-backups)', { defaultYes: false, safe: false }))) {
        done.push('Left the existing magpie skill as it is.');
        return;
      }
    } else {
      log('  The skill lets Claude Code search your saved posts from any project.');
      if (!(await agree('  Link it into ~/.claude/skills?', { defaultYes: true, safe: true }))) {
        todo.push('Optional: link the Claude skill: bash packages/skill/install.sh');
        return;
      }
    }
    await deps.linkSkill();
    done.push('The magpie skill is linked into ~/.claude/skills.');
  }

  function finish(ok: boolean): WalkthroughResult {
    log('');
    if (done.length > 0) {
      log('Done:');
      for (const line of done) log(`  ✓ ${line}`);
    }
    if (todo.length > 0) {
      log('Still to do:');
      for (const line of todo) log(`  • ${line}`);
    } else if (ok) {
      log(`All set. Open ${deps.appUrl}`);
    }
    return { ok, done, todo };
  }
}
