import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { LEGACY_NAMES, codeRoot } from '../config.ts';
import type { SkillState } from './walkthrough.ts';

const skillsDir = () => join(homedir(), '.claude', 'skills');

function linkState(link: string): SkillState {
  try {
    lstatSync(link);
  } catch {
    return 'missing';
  }
  try {
    return realpathSync(link) === realpathSync(join(codeRoot(), 'packages', 'skill')) ? 'linked' : 'elsewhere';
  } catch {
    return 'elsewhere';
  }
}

export function skillLinkState(): SkillState {
  if (!existsSync(join(homedir(), '.claude'))) return 'none';
  return linkState(join(skillsDir(), 'magpie'));
}

export function skillLinkStateAnyName(): SkillState {
  const current = skillLinkState();
  if (current !== 'missing') return current;
  return linkState(join(skillsDir(), LEGACY_NAMES.skill));
}
