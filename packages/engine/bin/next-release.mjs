#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

const { formatVersion, nextVersion, parseVersion } = await import('../src/release/version.ts');

const git = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

function lastTag() {
  try {
    return git(['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*', 'HEAD']).trim();
  } catch {
    return null;
  }
}

const tag = lastTag();
const range = tag ? `${tag}..HEAD` : 'HEAD';
const messages = git(['log', '--format=%B%x00', range]).split('\0').map((message) => message.trim()).filter(Boolean);
const next = nextVersion(tag ? parseVersion(tag) : null, messages);

console.log(`version=${next ? formatVersion(next) : ''}`);
