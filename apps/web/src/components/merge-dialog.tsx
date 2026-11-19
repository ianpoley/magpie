"use client";

import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  type createAlertDialogController,
} from "@ui-sdk/react/alert-dialog";
import { useState } from "react";

import { mergeTopics } from "@/app/actions";
import type { Area, Topic } from "@/lib/types";

import { runAction } from "./run-action";
import { alertBackdrop, alertContent, primaryAnswer, quietAnswer } from "./styles";
import { TopicCombobox } from "./topic-combobox";

type MergeController = ReturnType<typeof createAlertDialogController<number>>;

function MergeForm({ from, topics, areas }: { from: Topic; topics: Topic[]; areas: Area[] }) {
  const [into, setInto] = useState<number | null>(null);
  const others = topics.filter((topic) => topic.id !== from.id && topic.kind !== "pinned");
  return (
    <>
      <AlertDialogTitle className="text-display text-[20px]">Merge “{from.name}” into another topic</AlertDialogTitle>
      <AlertDialogDescription className="mt-2 text-[14px] leading-[1.55] text-pretty text-ink-muted">
        Its posts move to the topic you choose, which also collects what would have matched “{from.name}” from now on. “{from.name}” goes
        away. This cannot be undone.
      </AlertDialogDescription>
      <div className="mt-4">
        <TopicCombobox label="Topic to merge into" placeholder="Choose a topic" topics={others} areas={areas} value={into} onChoose={setInto} />
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <AlertDialogClose className={quietAnswer}>Cancel</AlertDialogClose>
        <AlertDialogClose
          value="confirm"
          disabled={into === null}
          className={primaryAnswer}
          action={async () => {
            if (into !== null) await runAction(mergeTopics(from.id, into));
          }}
        >
          Merge topics
        </AlertDialogClose>
      </div>
    </>
  );
}

/** Picks the topic another one folds into, and confirms it: a merge has no undo. */
export function MergeDialog({
  controller,
  topics,
  areas,
  topicsById,
}: {
  controller: MergeController;
  topics: Topic[];
  areas: Area[];
  topicsById: Map<number, Topic>;
}) {
  return (
    <AlertDialog controller={controller}>
      <AlertDialogBackdrop className={alertBackdrop} />
      <AlertDialogContent<number> initialFocus="input" className={alertContent}>
        {(state) => {
          const from = state.payload === undefined ? undefined : topicsById.get(state.payload);
          if (!from) return <AlertDialogTitle className="sr-only">Merge topics</AlertDialogTitle>;
          return <MergeForm key={from.id} from={from} topics={topics} areas={areas} />;
        }}
      </AlertDialogContent>
    </AlertDialog>
  );
}
