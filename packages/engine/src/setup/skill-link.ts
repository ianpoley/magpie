import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { codeRoot } from '../config.ts';
import type { SkillState } from './walkthrough.ts';

export function skillLinkState(): SkillState {
  if (!existsSync(join(homedir(), '.claude'))) return 'none';
  const link = join(homedir(), '.claude', 'skills', 'magpie');
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
