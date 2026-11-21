"use client";

import { createPopoverController, Popover, PopoverContent, PopoverDescription, PopoverTitle } from "@ui-sdk/react/popover";
import { Check, Sparkles, X } from "lucide-react";
import { useEffect, useTransition } from "react";

import { addPostTopic, removePostTopic } from "@/app/actions";
import type { Area, Post, Topic } from "@/lib/types";

import { runAction } from "./run-action";
import { softButton } from "./styles";
import { Tip } from "./tip";
import { TopicCombobox } from "./topic-combobox";

export const createPostTopicsController = () => createPopoverController<string>();
export type PostTopicsController = ReturnType<typeof createPostTopicsController>;

function Editor({
  post,
  topics,
  areas,
  topicsById,
  onSelectTopic,
  onEdit,
}: {
  post: Post;
  topics: Topic[];
  areas: Area[];
  topicsById: Map<number, Topic>;
  onSelectTopic: (topicId: number) => void;
  onEdit: (postId: string) => void;
}) {
  const [saving, startSaving] = useTransition();
  const current = new Set(post.memberships.map((membership) => membership.topicId));
  const save = (edit: () => Promise<unknown>) => {
    onEdit(post.id);
    startSaving(async () => void (await edit()));
  };
  const suggested = post.memberships.filter((membership) => membership.band === "unsure").map((membership) => membership.topicId);
  const addAllSuggested = () =>
    save(async () => {
      for (const topicId of suggested) {
        if (!(await runAction(addPostTopic(post.id, topicId)))) return;
      }
    });

  return (
    <>
      <div className="shrink-0">
        <PopoverTitle className="text-[15px] font-bold text-ink">Topics on this post</PopoverTitle>
        <PopoverDescription className="mt-0.5 text-[12px] leading-snug text-ink-muted">
          What you add or remove here holds through every later sync.
        </PopoverDescription>
      </div>
      {post.memberships.length === 0 ? (
        <p className="rounded-inner bg-sunken px-3 py-2.5 text-[13px] text-ink-muted">No topic has claimed this post yet.</p>
      ) : (
        <ul aria-label="Topics on this post" className="-mx-1 flex max-h-56 min-h-9 flex-col overflow-y-auto overscroll-contain">
          {post.memberships.map(({ topicId, band }) => {
            const topic = topicsById.get(topicId);
            if (!topic) return null;
            return (
              <li key={topicId} className="flex h-9 shrink-0 items-center gap-1 rounded-[9px] pr-0.5 hover:bg-sunken">
                <button
                  type="button"
                  aria-label={band === "unsure" ? `Filter to ${topic.name}, suggested by AI` : `Filter to ${topic.name}`}
                  onClick={() => onSelectTopic(topicId)}
                  className="focus-ring flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-[9px] border-0 bg-transparent pl-2 text-left"
                >
                  {band === "unsure" ? (
                    <span className="flex shrink-0 text-chip-possible-text">
                      <Sparkles className="size-3.5" aria-hidden="true" />
                    </span>
                  ) : null}
                  <span className="min-w-0 truncate text-[13px] font-semibold text-ink">{topic.name}</span>
                </button>
                {band === "unsure" ? (
                  <Tip label="Add to this post">
                    <button
                      type="button"
                      disabled={saving}
                      aria-label={`Add ${topic.name}`}
                      onClick={() => save(() => runAction(addPostTopic(post.id, topicId)))}
                      className="focus-ring pressable flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-ink-muted hover:bg-primary-soft hover:text-primary-text disabled:cursor-progress disabled:opacity-50"
                    >
                      <Check className="size-4" aria-hidden="true" />
                    </button>
                  </Tip>
                ) : null}
                <button
                  type="button"
                  disabled={saving}
                  aria-label={`Remove ${topic.name}`}
                  onClick={() => save(() => runAction(removePostTopic(post.id, topicId)))}
                  className="focus-ring pressable flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink-muted hover:bg-like-soft hover:text-like-text disabled:cursor-progress disabled:opacity-50"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {suggested.length > 1 ? (
        <button type="button" disabled={saving} onClick={addAllSuggested} className={`${softButton} self-start`}>
          <Sparkles className="size-3.5 text-chip-possible-text" aria-hidden="true" />
          Add all {suggested.length} suggested
        </button>
      ) : null}
      <TopicCombobox
        label="Add a topic"
        placeholder="Add a topic"
        topics={topics.filter((topic) => !current.has(topic.id))}
        areas={areas}
        value={null}
        resetOnChoose
        disabled={saving}
        onChoose={(topicId) => {
          if (topicId !== null) save(() => runAction(addPostTopic(post.id, topicId)));
        }}
      />
    </>
  );
}

export function PostTopicsEditor({
  controller,
  postsById,
  topics,
  areas,
  topicsById,
  align = "end",
  listed,
  onSelectTopic,
  onEdit,
}: {
  controller: PostTopicsController;
  postsById: Map<string, Post>;
  topics: Topic[];
  areas: Area[];
  topicsById: Map<number, Topic>;
  align?: "start" | "end";
  listed?: Set<string>;
  onSelectTopic: (topicId: number) => void;
  onEdit: (postId: string) => void;
}) {
  useEffect(() => {
    const postId = controller.getPayload();
    if (listed && postId !== undefined && controller.isOpen() && !listed.has(postId)) controller.close();
  });

  return (
    <Popover controller={controller}>
      <PopoverContent<string>
        align={align}
        sideOffset={6}
        collisionPadding={12}
        className="w-[min(26rem,calc(100vw-1.5rem))] max-w-none origin-(--transform-origin) gap-3 overflow-hidden rounded-card border-0 bg-surface p-4 shadow-(--ui-shadow) transition-[opacity,scale] duration-150 ease-out data-starting-style:scale-96 data-starting-style:opacity-0 data-ending-style:scale-96 data-ending-style:opacity-0 motion-reduce:transition-none"
      >
        {(state) => {
          const post = typeof state.payload === "string" ? postsById.get(state.payload) : undefined;
          if (!post) return <PopoverTitle className="text-[14px] font-semibold text-ink">This post is no longer saved</PopoverTitle>;
          return (
            <Editor
              key={post.id}
              post={post}
              topics={topics}
              areas={areas}
              topicsById={topicsById}
              onEdit={onEdit}
              onSelectTopic={(topicId) => {
                controller.close();
                onSelectTopic(topicId);
              }}
            />
          );
        }}
      </PopoverContent>
    </Popover>
  );
}
