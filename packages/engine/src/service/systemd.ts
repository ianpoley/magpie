import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { Runner, ServiceManager, ServiceSpec, UnitName } from './manager.ts';
import { must } from './manager.ts';

const specifiers = (text: string) => text.replaceAll('%', '%%');
const quoted = (text: string) => `"${text.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;

function word(arg: string): string {
  const text = specifiers(arg).replaceAll('$', () => '$$');
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(text) ? text : quoted(text);
}

function unword(text: string): string {
  const bare = text.startsWith('"') ? text.slice(1, -1).replace(/\\(.)/g, '$1') : text;
  return bare.replaceAll('$$', '$').replaceAll('%%', '%');
}

export function renderUnit(spec: ServiceSpec): string {
  return [
    '[Unit]',
    `Description=${spec.description}`,
    '',
    '[Service]',
    'Type=exec',
    `WorkingDirectory=${specifiers(spec.workingDirectory)}`,
    ...Object.entries(spec.environment).map(([key, value]) => `Environment=${quoted(specifiers(`${key}=${value}`))}`),
    `ExecStart=${spec.program.map(word).join(' ')}`,
    'Restart=on-failure',
    'RestartSec=5',
    `StandardOutput=append:${specifiers(spec.stdoutPath)}`,
    `StandardError=append:${specifiers(spec.stderrPath)}`,
    '',
    '[Install]',
    'WantedBy=default.target',
    '',
  ].join('\n');
}

export function systemd(options: { home: string; env: Record<string, string | undefined>; run: Runner }): ServiceManager {
  const { home, env, run } = options;
  const dir = join(env.XDG_CONFIG_HOME || join(home, '.config'), 'systemd', 'user');
  const unit = (name: UnitName) => `${name}.service`;
  const unitPath = (name: UnitName) => join(dir, unit(name));
  const ctl = (...args: string[]) => must(run, 'systemctl', ['--user', ...args]);

  return {
    unitPath,
    render: renderUnit,
    nodePathOf(text) {
      const line = /^ExecStart=("(?:[^"\\]|\\.)*"|\S+)/m.exec(text);
      return line ? unword(line[1]) : null;
    },
    dataRootOf(text) {
      const line = /^Environment="(?:MAGPIE|X_CORPUS)_ROOT=((?:[^"\\]|\\.)*)"$/m.exec(text);
      return line ? line[1].replace(/\\(.)/g, '$1').replaceAll('%%', '%') : null;
    },
    async stop(name) {
      if (existsSync(unitPath(name))) await ctl('stop', unit(name));
    },
    async start(names) {
      await ctl('daemon-reload');
      await ctl('enable', ...names.map(unit));
      await ctl('restart', ...names.map(unit));
    },
    async remove(names) {
      const installed = names.filter((name) => existsSync(unitPath(name)));
      if (installed.length > 0) await ctl('disable', '--now', ...installed.map(unit));
    },
    async afterRemove() {
      await ctl('daemon-reload');
    },
    async state(name) {
      const enabled = await run('systemctl', ['--user', 'is-enabled', unit(name)]);
      const active = await run('systemctl', ['--user', 'is-active', unit(name)]);
      return { loaded: enabled.stdout.trim() === 'enabled', running: active.stdout.trim() === 'active' };
    },
  };
}
