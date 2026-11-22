import { ASK } from '../config.ts';
import type { Store } from '../store/db.ts';
import type { JevQuestion, JevRequest } from './client.ts';

export type LinkedPage = { host?: string; title?: string; description?: string };

export type PostContent = {
  text: string;
  quoted_post?: string;
  linked_pages?: LinkedPage[];
};

export type PostSource = {
  text: string;
  quotedText?: string | null;
  links?: { host: string | null; title: string | null; description: string | null }[];
};

export function postContent(source: PostSource, charLimit: number = ASK.contentCharLimit): PostContent {
  let left = charLimit;
  const take = (value: string | null | undefined): string => {
    const taken = (value ?? '').trim().slice(0, left);
    left -= taken.length;
    return taken;
  };

  const content: PostContent = { text: take(source.text) };
  const quoted = take(source.quotedText);
  if (quoted) content.quoted_post = quoted;

  const pages: LinkedPage[] = [];
  for (const link of source.links ?? []) {
    const untitled = !link.title || link.title.trim().toLowerCase() === (link.host ?? '').toLowerCase();
    const title = untitled ? '' : take(link.title);
    const description = take(link.description);
    if (!title && !description) continue;
    const page: LinkedPage = {};
    if (link.host) page.host = link.host;
    if (title) page.title = title;
    if (description) page.description = description;
    pages.push(page);
  }
  if (pages.length > 0) content.linked_pages = pages;
  return content;
}

export function hasSomethingToJudge(content: PostContent): boolean {
  return Boolean(
    content.quoted_post || content.linked_pages || content.text.replace(/https?:\/\/\S+/g, '').trim(),
  );
}

const QUOTED_TEXT_KEYS = ['full_text', 'text', 'content'];

function quotedText(quotedJson: string | null): string | null {
  if (!quotedJson) return null;
  try {
    const quoted = JSON.parse(quotedJson) as Record<string, unknown>;
    for (const key of QUOTED_TEXT_KEYS) {
      if (typeof quoted[key] === 'string' && quoted[key]) return quoted[key];
    }
  } catch {
  }
  return null;
}

export function readPostContent(db: Store, postIds: string[], charLimit: number = ASK.contentCharLimit): Map<string, PostContent> {
  const post = db.prepare(`SELECT text, quoted_json FROM posts WHERE id = ?`);
  const links = db.prepare(
    `SELECT l.host, l.title, l.description
     FROM post_links pl JOIN links l ON l.url = pl.link_url
     WHERE pl.post_id = ? AND l.status = 'resolved'
     ORDER BY pl.position, pl.link_url`,
  );
  const contents = new Map<string, PostContent>();
  for (const id of postIds) {
    const row = post.get(id);
    if (!row) continue;
    contents.set(
      id,
      postContent({
        text: String(row.text),
        quotedText: quotedText(row.quoted_json as string | null),
        links: links.all(id) as PostSource['links'],
      }, charLimit),
    );
  }
  return contents;
}

export type TopicDefinition = { id: number; name: string; definition: string };

const ABOUT_TOPIC = {
  true: 'The post, the post it quotes, or a page it links to is about this topic or shares a resource for it.',
  false: 'The post is about something else, or mentions this topic only in passing.',
};

export const topicQuestionId = (topicId: number): string => `topic_${topicId}`;

export function topicQuestion(topic: Pick<TopicDefinition, 'name' | 'definition'>): JevQuestion {
  return {
    instructions: {
      topic: { name: topic.name, definition: topic.definition },
      question: 'Is `post` about this topic?',
    },
    criteria: ABOUT_TOPIC,
  };
}

export function taggingRequest(content: PostContent, topics: TopicDefinition[]): JevRequest {
  const questions: JevRequest['questions'] = {};
  for (const topic of topics) questions[topicQuestionId(topic.id)] = topicQuestion(topic);
  return { state: { post: content }, questions };
}

export const askQuestionId = (postId: string): string => `post_${postId}`;

export function askRequest(query: string, posts: { id: string; content: PostContent }[]): JevRequest {
  const questions: JevRequest['questions'] = {};
  for (const { id, content } of posts) {
    questions[askQuestionId(id)] = {
      instructions: { post: content, question: 'Is this post about `topic`?' },
      criteria: ABOUT_TOPIC,
    };
  }
  return { state: { topic: query }, questions };
}
