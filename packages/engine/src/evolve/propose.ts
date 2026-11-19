import { askJson } from '../claude/cli.ts';
import type { ClaudeAdapter, ClaudeAnswer } from '../claude/cli.ts';
import { UNTRUSTED_NOTICE, cleanLabel } from '../claude/sanitize.ts';
import type { JsonSchema } from '../claude/schemas.ts';
import { DISCOVERY } from '../config.ts';
import { readPostContent } from '../jev/questions.ts';
import type { Store } from '../store/db.ts';

/** A proposal as it would be stored: every label cleaned and capped. Any label may be ''. */
export type TopicProposal = { name: string; area: string; areaIsDev: boolean; definition: string };
export type SubtopicProposal = { name: string; definition: string };

type NewTopicAnswer = { name: string; area: string; area_is_dev: boolean; definition: string };
type SplitAnswer = { subtopics: { name: string; definition: string }[] };

const newTopicSchema: JsonSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    area: { type: 'string' },
    area_is_dev: { type: 'boolean' },
    definition: { type: 'string' },
  },
  required: ['name', 'area', 'area_is_dev', 'definition'],
  additionalProperties: false,
};

const splitSchema: JsonSchema = {
  type: 'object',
  properties: {
    subtopics: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, definition: { type: 'string' } },
        required: ['name', 'definition'],
        additionalProperties: false,
      },
    },
  },
  required: ['subtopics'],
  additionalProperties: false,
};

const POSTS_INTRO =
  'one JSON object per line: the post text, the text of a post it quotes, and the titles of pages it links to';

function postLines(db: Store, postIds: string[]): string[] {
  const cap = (value: string) => value.slice(0, DISCOVERY.postCharLimit);
  const lines: string[] = [];
  for (const content of readPostContent(db, postIds).values()) {
    const post: { text: string; quoted?: string; links?: string[] } = { text: cap(content.text) };
    if (content.quoted_post) post.quoted = cap(content.quoted_post);
    const titles = (content.linked_pages ?? []).flatMap((page) => (page.title ? [cap(page.title)] : []));
    if (titles.length > 0) post.links = titles;
    lines.push(JSON.stringify(post));
  }
  return lines;
}

function categoryLines(db: Store): string[] {
  return db
    .prepare(
      `SELECT a.name AS area, t.name AS topic, t.definition
       FROM topics t JOIN areas a ON a.id = t.area_id
       WHERE t.state = 'active' AND t.kind = 'auto' AND a.state = 'active' AND a.kind = 'auto'
       ORDER BY a.position, a.id, t.position, t.id`,
    )
    .all()
    .map((row) => JSON.stringify({ area: row.area, topic: row.topic, definition: row.definition }));
}

function blockedNameLines(db: Store): string[] {
  return db
    .prepare(
      `SELECT name FROM topics WHERE state = 'deleted'
       UNION SELECT name FROM suppressed_proposals
       UNION SELECT name FROM areas WHERE state = 'deleted'
       ORDER BY name`,
    )
    .all()
    .map((row) => JSON.stringify(row.name));
}

/** Asks Claude for the one topic most of the given Unfiled posts would fit. */
export async function proposeNewTopic(
  db: Store,
  claude: ClaudeAdapter,
  postIds: string[],
): Promise<ClaudeAnswer<TopicProposal>> {
  const prompt = [
    `Below are posts one person saved on X that fit none of their existing topics, ${POSTS_INTRO}.`,
    UNTRUSTED_NOTICE,
    '',
    'Propose the one new topic that the largest group of these posts shares.',
    '- A topic is a specific subject several posts share, such as "Evals" or "Animations", not a single post.',
    '- Give it a short name and a one-line definition that says which posts belong.',
    '- Put it in the existing area it fits. Name a new area only when none fits, and set "area_is_dev" to true when that area is about software development, engineering, design, or building products, false otherwise.',
    '- Do not repeat an existing topic, and do not propose anything the person removed.',
    '',
    'Existing topics:',
    ...categoryLines(db),
    '',
    'Removed by the person, never propose these or a renamed copy:',
    ...blockedNameLines(db),
    '',
    'Posts:',
    ...postLines(db, postIds),
  ].join('\n');
  const answer = await askJson<NewTopicAnswer>(claude, { prompt, schema: newTopicSchema });
  if (!answer.ok) return answer;
  return {
    ok: true,
    value: {
      name: cleanLabel(answer.value.name, DISCOVERY.nameMaxChars),
      area: cleanLabel(answer.value.area, DISCOVERY.nameMaxChars),
      areaIsDev: answer.value.area_is_dev,
      definition: cleanLabel(answer.value.definition, DISCOVERY.definitionMaxChars),
    },
  };
}

/** Asks Claude to divide a topic that has grown too broad into narrower ones. */
export async function proposeSplit(
  db: Store,
  claude: ClaudeAdapter,
  parent: { name: string; definition: string },
  postIds: string[],
): Promise<ClaudeAnswer<SubtopicProposal[]>> {
  const prompt = [
    `Below are posts one person saved on X under one topic that has grown too broad to be useful, ${POSTS_INTRO}.`,
    UNTRUSTED_NOTICE,
    '',
    `The topic: ${JSON.stringify({ name: parent.name, definition: parent.definition })}`,
    '',
    'Propose two to five narrower topics that together replace it.',
    '- Each is a specific subject many of these posts share, and together they should cover nearly all of the posts.',
    '- Give each a short name and a one-line definition that says which posts belong.',
    '- Do not repeat an existing topic, and do not propose anything the person removed.',
    '',
    'Existing topics:',
    ...categoryLines(db),
    '',
    'Removed by the person, never propose these or a renamed copy:',
    ...blockedNameLines(db),
    '',
    'Posts:',
    ...postLines(db, postIds.slice(0, DISCOVERY.batchSize)),
  ].join('\n');
  const answer = await askJson<SplitAnswer>(claude, { prompt, schema: splitSchema });
  if (!answer.ok) return answer;
  return {
    ok: true,
    value: answer.value.subtopics.map((subtopic) => ({
      name: cleanLabel(subtopic.name, DISCOVERY.nameMaxChars),
      definition: cleanLabel(subtopic.definition, DISCOVERY.definitionMaxChars),
    })),
  };
}
