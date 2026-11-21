import { askJson } from '../claude/cli.ts';
import type { ClaudeAdapter, ClaudeFailure } from '../claude/cli.ts';
import { IN_FOCUS_RULE, focusSection } from '../claude/focus.ts';
import { areaJudgmentSchema } from '../claude/schemas.ts';
import type { AreaJudgment } from '../claude/schemas.ts';
import { key } from '../evolve/tombstones.ts';
import { transaction } from '../store/db.ts';
import type { Store } from '../store/db.ts';
import type { FocusSetting } from './setting.ts';

export type ResortArea = { id: number; name: string };
export type ResortPreview = { ok: true; toHide: ResortArea[]; toShow: ResortArea[] } | ClaudeFailure;

type Candidate = ResortArea & { hidden: boolean };

function candidates(db: Store): Candidate[] {
  return db
    .prepare(
      `SELECT id, name, hidden FROM areas
       WHERE kind = 'auto' AND state = 'active' AND set_by_owner = 0
       ORDER BY position, id`,
    )
    .all()
    .map((row) => ({ id: Number(row.id), name: String(row.name), hidden: Number(row.hidden) === 1 }));
}

const area = ({ id, name }: Candidate): ResortArea => ({ id, name });

function judgmentPrompt(db: Store, target: FocusSetting, names: string[]): string {
  return [
    ...focusSection(db, target),
    'Judge whether each area below is inside this person\'s focus. Answer once for every area, using its name exactly as given.',
    `- ${IN_FOCUS_RULE}`,
    '',
    'Areas:',
    ...names.map((name) => JSON.stringify(name)),
  ].join('\n');
}

export async function previewResort(
  db: Store,
  target: FocusSetting,
  deps: { claude: ClaudeAdapter },
): Promise<ResortPreview> {
  const unset = candidates(db);
  if (target.mode === 'all') return { ok: true, toHide: [], toShow: unset.filter((c) => c.hidden).map(area) };
  if (unset.length === 0) return { ok: true, toHide: [], toShow: [] };

  const answer = await askJson<AreaJudgment>(deps.claude, {
    prompt: judgmentPrompt(db, target, unset.map((c) => c.name)),
    schema: areaJudgmentSchema,
  });
  if (!answer.ok) return answer;

  const inFocus = new Map(answer.value.areas.map((judged) => [key(judged.name), judged.in_focus]));
  const judged = (c: Candidate) => inFocus.get(key(c.name));
  return {
    ok: true,
    toHide: unset.filter((c) => !c.hidden && judged(c) === false).map(area),
    toShow: unset.filter((c) => c.hidden && judged(c) === true).map(area),
  };
}

export function applyResort(
  db: Store,
  preview: { toHide: Pick<ResortArea, 'id'>[]; toShow: Pick<ResortArea, 'id'>[] },
): { changed: number; skipped: number } {
  return transaction(db, () => {
    const now = new Date().toISOString();
    const update = db.prepare(
      `UPDATE areas SET hidden = ?, updated_at = ?
       WHERE id = ? AND state = 'active' AND kind = 'auto' AND set_by_owner = 0`,
    );
    const targets = [
      ...preview.toHide.map(({ id }) => [id, 1] as const),
      ...preview.toShow.map(({ id }) => [id, 0] as const),
    ];
    let changed = 0;
    for (const [id, hidden] of targets) changed += Number(update.run(hidden, now, id).changes);
    return { changed, skipped: targets.length - changed };
  });
}
