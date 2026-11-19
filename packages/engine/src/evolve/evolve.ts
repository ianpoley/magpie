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
  /** Topics created from Unfiled posts. */
  newTopics: number;
  /** Topics replaced by narrower ones. */
  splits: number;
  /** Proposals that did not hold up. */
  rejected: number;
  /** Proposals abandoned because the user edited what they touch meanwhile. */
  dropped: number;
  /** Set when the stage stopped early because a model could not be reached; counts cover what ran before. */
  skipped: { reason: 'claude' | 'jev'; message: string } | null;
};

/**
 * Grows the category list where the corpus demands it. While enough Unfiled
 * posts wait, Claude proposes a topic for them and it is created when Jev's
 * scores support it; then each topic that has grown too broad is offered a
 * split. Every change is logged and can be undone. Locked topics, pinned
 * searches and anything the user removed are left alone.
 *
 * New-topic rounds run first: a new topic makes the posts not yet scored
 * against it pending, and pending posts are not evolution input.
 *
 * The caller runs a tagging pass afterwards so every post is scored against
 * what was created.
 */
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

  // Left by a run that stopped between scoring a proposal and applying it.
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
