import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import type { Runner, ServiceManager, ServiceName, ServiceSpec } from './manager.ts';
import { must } from './manager.ts';

const escape = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const unescape = (text: string) => text.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');

export function renderPlist(spec: ServiceSpec): string {
  const string = (value: string) => `<string>${escape(value)}</string>`;
  const env = Object.entries(spec.environment).flatMap(([key, value]) => [
    `        <key>${escape(key)}</key>`,
    `        ${string(value)}`,
  ]);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '    <key>Label</key>',
    `    ${string(spec.name)}`,
    '    <key>ProgramArguments</key>',
    '    <array>',
    ...spec.program.map((arg) => `        ${string(arg)}`),
    '    </array>',
    '    <key>WorkingDirectory</key>',
    `    ${string(spec.workingDirectory)}`,
    '    <key>EnvironmentVariables</key>',
    '    <dict>',
    ...env,
    '    </dict>',
    '    <key>RunAtLoad</key>',
    '    <true/>',
    '    <key>KeepAlive</key>',
    '    <dict>',
    '        <key>SuccessfulExit</key>',
    '        <false/>',
    '    </dict>',
    '    <key>StandardOutPath</key>',
    `    ${string(spec.stdoutPath)}`,
    '    <key>StandardErrorPath</key>',
    `    ${string(spec.stderrPath)}`,
    '</dict>',
    '</plist>',
    '',
  ].join('\n');
}

export const LAUNCHD_SETTLE = { pollMs: 250, timeoutMs: 30_000, bootstrapAttempts: 5, bootstrapGapMs: 1_000 } as const;

export function launchd(options: { home: string; uid: number; run: Runner; sleep?: (ms: number) => Promise<unknown> }): ServiceManager {
  const { home, uid, run, sleep = delay } = options;
  const domain = `gui/${uid}`;
  const target = (name: ServiceName) => `${domain}/${name}`;
  const unitPath = (name: ServiceName) => join(home, 'Library', 'LaunchAgents', `${name}.plist`);
  const print = (name: ServiceName) => run('launchctl', ['print', target(name)]);
  const loaded = async (name: ServiceName) => (await print(name)).code === 0;
  const bootout = async (name: ServiceName) => {
    if (!(await loaded(name))) return;
    await must(run, 'launchctl', ['bootout', target(name)]);
    for (let waited = 0; waited < LAUNCHD_SETTLE.timeoutMs && (await loaded(name)); waited += LAUNCHD_SETTLE.pollMs) {
      await sleep(LAUNCHD_SETTLE.pollMs);
    }
  };
  const bootstrap = async (name: ServiceName) => {
    for (let attempt = 1; attempt < LAUNCHD_SETTLE.bootstrapAttempts; attempt++) {
      if ((await run('launchctl', ['bootstrap', domain, unitPath(name)])).code === 0) return;
      await sleep(LAUNCHD_SETTLE.bootstrapGapMs);
    }
    await must(run, 'launchctl', ['bootstrap', domain, unitPath(name)]);
  };

  return {
    unitPath,
    render: renderPlist,
    nodePathOf(text) {
      const args = /<key>ProgramArguments<\/key>\s*<array>\s*<string>([^<]*)<\/string>/.exec(text);
      return args ? unescape(args[1]) : null;
    },
    dataRootOf(text) {
      const root = /<key>MAGPIE_ROOT<\/key>\s*<string>([^<]*)<\/string>/.exec(text);
      return root ? unescape(root[1]) : null;
    },
    stop: bootout,
    async start(names) {
      for (const name of names) {
        await bootout(name);
        await must(run, 'launchctl', ['enable', target(name)]);
        await bootstrap(name);
        await must(run, 'launchctl', ['kickstart', '-k', target(name)]);
      }
    },
    async remove(names) {
      for (const name of names) await bootout(name);
    },
    async afterRemove() {},
    async state(name) {
      const printed = await print(name);
      return { loaded: printed.code === 0, running: printed.code === 0 && /^\s*state = running\s*$/m.test(printed.stdout) };
    },
  };
}
