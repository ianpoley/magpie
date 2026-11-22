import type { JsonSchema } from "@magpie/engine/src/claude/schemas.ts";
import type { JevChoice, JevChoiceQuestion } from "@magpie/engine/src/jev/client.ts";

export const INTENTS = ["find", "explain", "compare", "howto"] as const;
export type Intent = (typeof INTENTS)[number];

const FALLBACK_INTENT: Intent = "explain";
const MIN_INTENT_PROBABILITY = 0.5;

export type Cited = { postIds: string[] };
export type FindItem = Cited & { name: string; what: string; quote: string; quoteCut: boolean };
export type Theme = Cited & { title: string; body: string };
export type CompareOption = Cited & { name: string; bestFor: string; strengths: string[]; weaknesses: string[] };
export type Step = Cited & { title: string; body: string };
export type Pitfall = Cited & { text: string };

type Common = { lead: string; followUps: string[]; read: number; model: string };

export type Answer = Common &
  (
    | { intent: "find"; items: FindItem[]; gaps: string }
    | { intent: "explain"; themes: Theme[]; disagreement: string }
    | { intent: "compare"; options: CompareOption[]; deciding: string }
    | { intent: "howto"; steps: Step[]; pitfalls: Pitfall[] }
  );

export const INTENT_QUESTION: JevChoiceQuestion = {
  instructions: "What kind of answer does the person asking `question` want from a collection of saved social posts?",
  criteria: {
    find: "A shortlist of concrete things to use: prompts, tools, repos, libraries, links, examples. They want the items themselves.",
    explain: "An overview of what people say or think about a subject: the main ideas, the consensus, where people disagree.",
    compare: "Two or more named options weighed against each other, ending in when to pick each.",
    howto: "Steps or a method for doing a specific task.",
    recent: "What is new or changed lately, in time order.",
  },
};

export function intentFrom(choice: JevChoice | null): Intent {
  if (!choice) return FALLBACK_INTENT;
  const known = INTENTS.find((intent) => intent === choice.choice);
  const probability = choice.probabilities[choice.choice] ?? 0;
  return known && probability >= MIN_INTENT_PROBABILITY ? known : FALLBACK_INTENT;
}

const STRING: JsonSchema = { type: "string" };
const list = (items: JsonSchema): JsonSchema => ({ type: "array", items });
const record = (properties: Record<string, JsonSchema>): JsonSchema => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const REFS = list(STRING);

export const ANSWER_SCHEMAS: Record<Intent, JsonSchema> = {
  find: record({ lead: STRING, items: list(record({ name: STRING, what: STRING, quote: STRING, complete: { type: "boolean" }, refs: REFS })), gaps: STRING, followUps: list(STRING) }),
  explain: record({ lead: STRING, themes: list(record({ title: STRING, body: STRING, refs: REFS })), disagreement: STRING, followUps: list(STRING) }),
  compare: record({
    lead: STRING,
    options: list(record({ name: STRING, bestFor: STRING, strengths: list(STRING), weaknesses: list(STRING), refs: REFS })),
    deciding: STRING,
    followUps: list(STRING),
  }),
  howto: record({ lead: STRING, steps: list(record({ title: STRING, body: STRING, refs: REFS })), pitfalls: list(record({ text: STRING, refs: REFS })), followUps: list(STRING) }),
};

export const SHAPE_INSTRUCTIONS: Record<Intent, string[]> = {
  find: [
    "They want the things themselves, not a summary of them.",
    "- lead: one sentence, at most 35 words, saying what you found.",
    "- items: the 4 to 10 strongest concrete items (a prompt, a tool, a repo, a technique), best first. Merge near-duplicates into one item.",
    "  - name: a short name for the item, at most 8 words.",
    "  - what: what it does and when to reach for it, at most 25 words.",
    "  - quote: the item itself copied word for word from a post when the post contains it (the prompt text, the command, the config line), at most 1,500 characters. An empty string when the post only names or links it.",
    "  - complete: false when the quote stops before the item ends in the post (you shortened it, or the post text you were given stops), true otherwise.",
    "  - refs: the 1 to 4 posts it comes from, strongest first.",
    "- gaps: one sentence on what the posts do not cover, or an empty string.",
  ],
  explain: [
    "- lead: the bottom line in one or two sentences, at most 45 words. Take a position when the posts support one.",
    "- themes: 2 to 5 themes, most important first.",
    "  - title: the claim in at most 9 words, sentence case.",
    "  - body: up to 90 words with the specifics: who says it, the technique, numbers, a short quote if one says it best.",
    "  - refs: the 1 to 6 posts behind it, strongest first.",
    "- disagreement: one or two sentences on where the posts disagree, or an empty string if they do not.",
  ],
  compare: [
    "- lead: the verdict in one or two sentences, at most 45 words: which wins for what.",
    "- options: one entry per option compared.",
    "  - name: the option.",
    "  - bestFor: at most 20 words.",
    "  - strengths and weaknesses: 1 to 4 each, at most 18 words each, specific.",
    "  - refs: the 1 to 6 posts behind this option, strongest first.",
    "- deciding: at most 50 words on how to choose, or when to use both.",
  ],
  howto: [
    "- lead: one or two sentences, at most 40 words, on the approach.",
    "- steps: 3 to 8 steps in the order to do them.",
    "  - title: the action, imperative, at most 8 words.",
    "  - body: up to 60 words with the specifics: tools, commands, numbers.",
    "  - refs: the 1 to 4 posts behind it.",
    "- pitfalls: 0 to 3 mistakes the posts warn about, at most 25 words each, with refs.",
  ],
};

export const PLAIN_STYLE = [
  "How to write every field you write yourself. These rules never apply to quote, which is copied exactly:",
  "- One idea per sentence. Keep most sentences under 20 words and none over 30.",
  '- Use active voice and name who acts: "Theo says", not "it is said".',
  '- Use plain words. Write "use", not "utilize" or "leverage". Never use delve, robust, seamless, crucial, pivotal, landscape, showcase, underscore, game-changer or groundbreaking.',
  "- No dashes of any kind between words or clauses, and no semicolons. Use a period, a comma, a colon or parentheses.",
  '- State the point directly. No "not X but Y", no "it\'s not just", no lead-ins such as "here\'s the thing", and no closing one-liners.',
  "- Do not list three adjectives for rhythm. Use a list of three only when there are three real things.",
  '- Name who said a thing (the author, or "one post"). Write "many posts" only when many posts say it. Never write "experts say".',
  '- Keep the posts\' certainty: "may" stays "may". Keep every number, name, version and identifier exact.',
  "- Use one term for one thing. Do not swap in synonyms for variety.",
  "- quote is different: copy it from the post character for character, even when it breaks these rules.",
];

export const FOLLOW_UPS_INSTRUCTION = "- followUps: 2 or 3 short follow-up questions this person would plausibly ask next, which these posts can answer. At most 12 words each.";

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const texts = (value: unknown): string[] => (Array.isArray(value) ? value.map(text).filter((item) => item !== "") : []);
const records = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null) : [];
const citedIds = (value: unknown, refs: Record<string, string>): string[] => [...new Set(texts(value).flatMap((ref) => refs[ref] ?? []))];

export function toAnswer(value: unknown, intent: Intent, refs: Record<string, string>, meta: { read: number; model: string }, partial: boolean): Answer | null {
  const written = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const lead = text(written.lead);
  if (lead === "") return null;
  const keep = <T extends Cited>(items: T[], named: (item: T) => string): T[] => items.filter((item) => named(item) !== "" && (partial || item.postIds.length > 0));
  const common = { lead, followUps: texts(written.followUps), ...meta };
  const answer: Answer =
    intent === "find"
      ? {
          ...common,
          intent,
          items: keep(
            records(written.items).map((item) => {
              const quote = typeof item.quote === "string" ? item.quote : "";
              return { name: text(item.name), what: text(item.what), quote, quoteCut: quote.trim() !== "" && item.complete === false, postIds: citedIds(item.refs, refs) };
            }),
            (item) => item.name,
          ),
          gaps: text(written.gaps),
        }
      : intent === "compare"
        ? {
            ...common,
            intent,
            options: keep(
              records(written.options).map((option) => ({
                name: text(option.name),
                bestFor: text(option.bestFor),
                strengths: texts(option.strengths),
                weaknesses: texts(option.weaknesses),
                postIds: citedIds(option.refs, refs),
              })),
              (option) => option.name,
            ),
            deciding: text(written.deciding),
          }
        : intent === "howto"
          ? {
              ...common,
              intent,
              steps: keep(records(written.steps).map((step) => ({ title: text(step.title), body: text(step.body), postIds: citedIds(step.refs, refs) })), (step) => step.title),
              pitfalls: keep(records(written.pitfalls).map((pitfall) => ({ text: text(pitfall.text), postIds: citedIds(pitfall.refs, refs) })), (pitfall) => pitfall.text),
            }
          : {
              ...common,
              intent,
              themes: keep(records(written.themes).map((theme) => ({ title: text(theme.title), body: text(theme.body), postIds: citedIds(theme.refs, refs) })), (theme) => theme.title),
              disagreement: text(written.disagreement),
            };
  return partial || sectionCount(answer) > 0 ? answer : null;
}

export function sectionCount(answer: Answer): number {
  if (answer.intent === "find") return answer.items.length;
  if (answer.intent === "compare") return answer.options.length;
  if (answer.intent === "howto") return answer.steps.length;
  return answer.themes.length;
}

export function answerPostIds(answer: Answer): string[] {
  const sections: Cited[] =
    answer.intent === "find" ? answer.items : answer.intent === "compare" ? answer.options : answer.intent === "howto" ? [...answer.steps, ...answer.pitfalls] : answer.themes;
  return [...new Set(sections.flatMap((section) => section.postIds))];
}

const CUT_ESCAPE = /\\[^"\\/bfnrtu]?$|\\u[0-9a-fA-F]{0,3}$/;

export function parsePartialJson(json: string): unknown {
  const closers: string[] = [];
  const cuts: { at: number; closing: string }[] = [];
  let inString = false;
  let escaped = false;
  for (let index = 0; index < json.length; index++) {
    const char = json[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{" || char === "[") {
      closers.push(char === "{" ? "}" : "]");
      cuts.push({ at: index + 1, closing: closers.toReversed().join("") });
    } else if (char === "}" || char === "]") {
      closers.pop();
      cuts.push({ at: index + 1, closing: closers.toReversed().join("") });
    } else if (char === ",") cuts.push({ at: index, closing: closers.toReversed().join("") });
  }
  const attempts = [`${inString ? `${json.replace(CUT_ESCAPE, "")}"` : json}${closers.toReversed().join("")}`, ...cuts.toReversed().map((cut) => json.slice(0, cut.at) + cut.closing)];
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch {}
  }
  return null;
}

const ELLIPSIS = /\s*(?:\.\.\.|…)\s*/;
const CURLY_SINGLE = /[‘’]/g;
const CURLY_DOUBLE = /[“”]/g;
const SPACE = /\s+/g;
const CUT_TAIL_CHARS = 40;

const normalized = (value: string): string => value.replace(CURLY_SINGLE, "'").replace(CURLY_DOUBLE, '"').replace(SPACE, " ").trim().toLowerCase();

export type QuoteSource = { full: string; sent: string };

export function checkQuotes(answer: Answer, sources: Map<string, QuoteSource>): Answer {
  if (answer.intent !== "find") return answer;
  const items = answer.items.map((item) => {
    if (item.quote.trim() === "") return { ...item, quote: "", quoteCut: false };
    const cited = item.postIds.flatMap((id) => sources.get(id) ?? []);
    const pieces = item.quote.split(ELLIPSIS).map(normalized).filter((piece) => piece !== "");
    const found = cited.some((source) => pieces.every((piece) => normalized(source.full).includes(piece)));
    if (!found) return { ...item, quote: "", quoteCut: false };
    const tail = normalized(item.quote).slice(-CUT_TAIL_CHARS);
    const quoteCut = item.quoteCut || cited.some((source) => source.sent.length < source.full.length && normalized(source.sent).endsWith(tail));
    return { ...item, quoteCut };
  });
  return { ...answer, items };
}

export function answerText(answer: Answer): string {
  const lines = [answer.lead];
  if (answer.intent === "find") answer.items.forEach((item, index) => lines.push(`${index + 1}. ${item.name}: ${item.what}`));
  if (answer.intent === "explain") answer.themes.forEach((theme) => lines.push(`- ${theme.title}. ${theme.body}`));
  if (answer.intent === "compare")
    answer.options.forEach((option) => lines.push(`- ${option.name}: best for ${option.bestFor}. Strengths: ${option.strengths.join("; ")}. Weaknesses: ${option.weaknesses.join("; ")}.`));
  if (answer.intent === "howto") answer.steps.forEach((step, index) => lines.push(`${index + 1}. ${step.title}. ${step.body}`));
  return lines.join("\n");
}

type Source = (postId: string) => { handle: string; url: string } | null;

export function answerMarkdown(question: string, answer: Answer, footer: string, source: Source): string {
  const cite = (ids: string[]): string =>
    ids
      .flatMap((id) => {
        const post = source(id);
        return post ? [`[@${post.handle}](${post.url})`] : [];
      })
      .join(", ");
  const body: string[] = [];
  if (answer.intent === "find") {
    for (const item of answer.items) {
      body.push(`- **${item.name}.** ${item.what} ${cite(item.postIds)}`.trim());
      if (item.quote) body.push("", ...item.quote.split("\n").map((line) => `  > ${line}`), "");
    }
    if (answer.gaps) body.push("", `Not covered: ${answer.gaps}`);
  }
  if (answer.intent === "explain") {
    for (const theme of answer.themes) body.push(`### ${theme.title}`, "", `${theme.body} ${cite(theme.postIds)}`.trim(), "");
    if (answer.disagreement) body.push(`**Where they disagree:** ${answer.disagreement}`);
  }
  if (answer.intent === "compare") {
    for (const option of answer.options) {
      body.push(`### ${option.name}`, "", `Best for: ${option.bestFor} ${cite(option.postIds)}`.trim(), "");
      body.push(...option.strengths.map((item) => `- + ${item}`), ...option.weaknesses.map((item) => `- − ${item}`), "");
    }
    if (answer.deciding) body.push(`**How to choose:** ${answer.deciding}`);
  }
  if (answer.intent === "howto") {
    answer.steps.forEach((step, index) => body.push(`${index + 1}. **${step.title}.** ${step.body} ${cite(step.postIds)}`.trim()));
    if (answer.pitfalls.length > 0) body.push("", "Watch out for:", ...answer.pitfalls.map((pitfall) => `- ${pitfall.text} ${cite(pitfall.postIds)}`.trim()));
  }
  return [`## ${question}`, "", answer.lead, "", ...body, "", footer].join("\n");
}
