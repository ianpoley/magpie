import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { LEGACY_NAMES, codeRoot } from '../config.ts';
import type { SkillState } from './walkthrough.ts';

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
  const skills = join(homedir(), '.claude', 'skills');
  const current = linkState(join(skills, 'magpie'));
  if (current !== 'missing') return current;
  return linkState(join(skills, LEGACY_NAMES.skill));
}
