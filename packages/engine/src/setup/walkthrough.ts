import type { SetupCheck } from '../service/index.ts';
import { tildePaths, ui } from '../terminal.ts';
import type { UpdateHooksState } from './git-hooks.ts';

export type WalkthroughDeps = {
  interactive: boolean;
  yes: boolean;
  log: (line: string) => void;
  confirm: (question: string, defaultYes: boolean) => Promise<boolean>;
  secret: (prompt: string) => Promise<string>;
  checks: () => Promise<SetupCheck[]>;
  worktreeOf: string | null;
  services: () => Promise<ServicesState>;
  install: () => Promise<void>;
  connection: () => { handle: string | null } | undefined;
  appUrl: string;
  openApp: (url: string) => Promise<void>;
  waitForConnection: () => Promise<{ handle: string | null } | undefined>;
  jevStored: () => Promise<boolean>;
  storeJev: (key: string) => Promise<{ ok: boolean; message: string }>;
  skill: () => SkillState;
  linkSkill: () => Promise<boolean>;
  updateHooks: () => UpdateHooksState | null;
  installUpdateHooks: () => Promise<boolean>;
  foreignHookHelp: () => string[];
};

export type ServicesState = {
  installed: boolean;
  running: boolean;
  dataRoot: string | null;
  here: string;
  upgradeSafeNode?: string | null;
  buildBehindCode?: boolean;
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

  log(ui.intro('Magpie setup'));
  log(ui.rail());
  log(ui.step('Checking this machine'));
  const checks = await deps.checks();
  for (const check of checks) log(ui.rail(ui.check(check.level, check.name, tildePaths(check.detail))));
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
    log(ui.rail());
    log(ui.step('Git worktree'));
    log(ui.rail(`This is a git worktree of ${main}. It uses that checkout's corpus, services and connection.`));
    const services = await deps.services();
    if (services.running && services.dataRoot === main) done.push(`Background sync runs from ${main}.`);
    else todo.push(`Background sync is not running for ${main}: run bun run setup there.`);
    const connection = deps.connection();
    if (connection) done.push(`X is connected${at(connection.handle)}.`);
    else todo.push(`X is not connected: run bun run setup in ${main}.`);
    return finish(true);
  }

  const servicesRunning = await backgroundSync();
  if (servicesRunning) await updatesAfterPull();
  await connectX(servicesRunning);
  await jevKey();
  await claudeSkill();
  return finish(true);

  async function backgroundSync(): Promise<boolean> {
    log(ui.rail());
    log(ui.step('Background sync and the web app'));
    const services = await deps.services();
    if (services.dataRoot !== null && services.dataRoot !== services.here) {
      log(ui.rail(`The services are installed for another clone, ${services.dataRoot}.`));
      log(ui.rail('Installing here points both at this clone and its corpus instead.'));
      if (!(await agree('Point them at this clone?', { defaultYes: false, safe: false }))) {
        done.push(`Left the services on ${services.dataRoot}.`);
        return false;
      }
    } else if (services.installed && services.running && (services.upgradeSafeNode || services.buildBehindCode)) {
      if (services.upgradeSafeNode) {
        log(ui.rail('The services run a Node path that Homebrew deletes when it upgrades Node, which would stop them.'));
        log(ui.rail(`Reinstalling points them at ${services.upgradeSafeNode}, the same Node under a path that survives upgrades.`));
      }
      if (services.buildBehindCode) log(ui.rail('The services still run the build from before the last commit here, such as a git pull.'));
      if (!(await agree('Reinstall them now?', { defaultYes: true, safe: true }))) {
        todo.push(
          services.upgradeSafeNode
            ? 'Point the services at a Node path Homebrew keeps across upgrades: bun run setup, and answer yes'
            : 'Rebuild and restart the services on the current code: bun run setup, and answer yes',
        );
        return true;
      }
    } else if (services.installed && services.running) {
      done.push('Background sync and the web app are already running.');
      return true;
    } else if (services.installed) {
      log(ui.rail('The services are installed but not running.'));
      if (!(await agree('Reinstall and start them?', { defaultYes: true, safe: true }))) {
        todo.push('Start the services: bun run setup, and answer yes');
        return false;
      }
    } else {
      log(ui.rail('Two background services: a worker that syncs every few hours, and the web app.'));
      log(ui.rail('Installing builds the web app first, which takes about a minute.'));
      if (!(await agree('Install them now?', { defaultYes: true, safe: true }))) {
        todo.push('Install the background services: bun run setup, and answer yes');
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

  async function updatesAfterPull() {
    const state = deps.updateHooks();
    if (state === null) return;
    log(ui.rail());
    log(ui.step('Updates after git pull'));
    if (state === 'current') {
      done.push('Updates apply on their own after a git pull.');
      return;
    }
    if (state === 'foreign') {
      log(ui.rail('Your clone already has its own git hook, so Magpie leaves it alone.'));
      todo.push(`To apply updates on their own after a git pull, ${deps.foreignHookHelp().join(' ')}`);
      return;
    }
    if (state === 'missing') {
      log(ui.rail('After a git pull, Magpie can rebuild the web app and restart the services on its own, in the background.'));
      log(ui.rail('It does this only on the main branch of this checkout, and the app keeps running until the new build is ready.'));
      if (!(await agree('Apply updates on their own after git pull?', { defaultYes: true, safe: true }))) {
        todo.push('Optional: apply updates on their own after git pull: run bun run setup again and answer yes.');
        return;
      }
    }
    if (await deps.installUpdateHooks()) done.push('Updates apply on their own after a git pull.');
    else todo.push('The git hooks that apply updates were not written. Try again: bun run setup');
  }

  async function connectX(appRunning: boolean) {
    log(ui.rail());
    log(ui.step('Connect X'));
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
    log(ui.rail('Magpie syncs with your X session cookies. X\'s terms do not allow this, and X could limit your account.'));
    log(ui.rail('In a browser signed in to x.com, open dev tools > Application > Cookies > https://x.com'));
    log(ui.rail('and copy auth_token and ct0. You paste them into the Connect X dialog in the web app.'));
    if (!(await deps.confirm('Open the web app to connect now?', true))) {
      todo.push(`Connect X: ${howTo}`);
      return;
    }
    await deps.openApp(deps.appUrl);
    log(ui.rail(`Opened ${deps.appUrl}. Waiting for the connection; press Enter to skip.`));
    const connected = await deps.waitForConnection();
    if (connected) done.push(`X is connected${at(connected.handle)}; the first sync has started (watch it in the sidebar).`);
    else todo.push(`Connect X: ${howTo}`);
  }

  async function jevKey() {
    log(ui.rail());
    log(ui.step('Jev key'));
    if (await deps.jevStored()) {
      done.push('The Jev key is stored.');
      return;
    }
    const later = 'Add the Jev (TypeSafe) key: bun run secrets:set-jev, or paste it into the web app, which asks for it.';
    if (!deps.interactive) {
      todo.push(later);
      return;
    }
    log(ui.rail('Magpie needs a Jev (TypeSafe) API key to sort posts into topics. Skip it here and the web app asks for it.'));
    const key = await deps.secret('Jev key (typing is hidden; press Enter to skip):');
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
    log(ui.rail());
    log(ui.step('Claude skill (optional)'));
    if (state === 'linked') {
      done.push('The magpie skill is linked into ~/.claude/skills.');
      return;
    }
    if (state === 'elsewhere') {
      log(ui.rail('~/.claude/skills/magpie already points at another clone or folder.'));
      if (!(await agree('Link it to this clone instead? (the old one is kept in ~/.claude/skill-backups)', { defaultYes: false, safe: false }))) {
        done.push('Left the existing magpie skill as it is.');
        return;
      }
    } else {
      log(ui.rail('The skill lets Claude Code search your saved posts from any project.'));
      if (!(await agree('Link it into ~/.claude/skills?', { defaultYes: true, safe: true }))) {
        todo.push('Optional: link the Claude skill: bash packages/skill/install.sh');
        return;
      }
    }
    if (await deps.linkSkill()) done.push('The magpie skill is linked into ~/.claude/skills.');
    else todo.push('The magpie skill was not linked. Try again: bash packages/skill/install.sh');
  }

  function finish(ok: boolean): WalkthroughResult {
    const { paint } = ui;
    if (done.length > 0) {
      log(ui.rail());
      log(ui.step('Done'));
      for (const line of done) log(ui.rail(`${ui.mark.ok} ${line}`));
    }
    if (todo.length > 0) {
      log(ui.rail());
      log(ui.step('Still to do'));
      for (const line of todo) log(ui.rail(`${paint.yellow('•')} ${line}`));
    }
    log(ui.rail());
    if (!ok) log(ui.outro(paint.red('Setup stopped.')));
    else if (todo.length > 0) log(ui.outro(`Setup is done for now. ${todo.length === 1 ? 'One step is' : `${todo.length} steps are`} left above.`));
    else log(ui.outro(paint.green(`All set. Open ${deps.appUrl}`)));
    return { ok, done, todo };
  }
}
