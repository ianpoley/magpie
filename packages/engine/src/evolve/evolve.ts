import type { ClaudeAdapter, ClaudeFailure } from '../claude/cli.ts';
import type { JevClient } from '../jev/client.ts';
import type { Store } from '../store/db.ts';
import { newTopicRound, splitRound } from './apply.ts';
import type { RoundDeps, RoundOutcome } from './apply.ts';
import { proposeNewTopic, proposeSplit } from './propose.ts';
import { confidentPostIds } from './tombstones.ts';
import { newTopicTrigger, tooBroadTopics } from './triggers.ts';

export type EvolveDeps = { claude: ClaudeAdapter; jev: JevClient; runId?: number; now?: () => Date };

export type EvolveResult = {
  newTopics: number;
  splits: number;
  rejected: number;
  dropped: number;
  skipped: { reason: 'claude' | 'jev'; message: string } | null;
};

export async function evolve(db: Store, deps: EvolveDeps): Promise<EvolveResult> {
  const round: RoundDeps = { jev: deps.jev, runId: deps.runId, now: deps.now ?? (() => new Date()) };
  const result: EvolveResult = { newTopics: 0, splits: 0, rejected: 0, dropped: 0, skipped: null };
  const claudeFailed = (failure: ClaudeFailure): EvolveResult => {
    result.skipped = { reason: 'claude', message: `${failure.reason}: ${failure.message}` };
    return result;
  };
  const tally = (outcome: RoundOutcome, applied: 'newTopics' | 'splits'): boolean => {
    if (typeof outcome === 'object') {
      result.skipped = { reason: 'jev', message: outcome.skipped };
      return false;
    }
    result[outcome === 'applied' ? applied : outcome] += 1;
    return true;
  };

  db.exec(`DELETE FROM topics WHERE state = 'proposed'`);

  for (;;) {
    const trigger = newTopicTrigger(db);
    if (!trigger.fire) break;
    const proposal = await proposeNewTopic(db, deps.claude, trigger.shown);
    if (!proposal.ok) return claudeFailed(proposal);
    const outcome = await newTopicRound(db, round, proposal.value, trigger.eligible, trigger.shown);
    if (!tally(outcome, 'newTopics')) return result;
    if (outcome !== 'applied') break;
  }

  for (const parent of tooBroadTopics(db)) {
    const posts = confidentPostIds(db, [parent.id]).get(parent.id) ?? [];
    const proposal = await proposeSplit(db, deps.claude, parent, posts);
    if (!proposal.ok) return claudeFailed(proposal);
    if (!tally(await splitRound(db, round, parent, proposal.value), 'splits')) return result;
  }
  return result;
}
