"use client";

import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  createAlertDialogController,
} from "@ui-sdk/react/alert-dialog";
import { createDialogController, Dialog, DialogBackdrop, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@ui-sdk/react/dialog";
import { Input } from "@ui-sdk/react/input";
import { createMenuController, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@ui-sdk/react/menu";
import { Ellipsis, Eye, EyeOff, Merge, Pencil, PinOff, Trash2 } from "lucide-react";
import { useState, useTransition, type FormEvent, type SyntheticEvent } from "react";

import { deleteArea, deleteTopic, renameArea, renameTopic, setAreaHidden, setTopicHidden, unpin } from "@/app/actions";
import type { Area, Topic } from "@/lib/types";

import { formatCount, plural } from "./format";
import { MergeDialog } from "./merge-dialog";
import { runAction } from "./run-action";
import { alertBackdrop, alertContent, dangerAnswer, dialogContent, menuContent, menuItem, pageColors, primaryAnswer, quietAnswer, textField } from "./styles";

export type CategoryTarget = { kind: "topic" | "area"; id: number };

export const createCategoryMenu = () => createMenuController<CategoryTarget>();
export type CategoryMenuController = ReturnType<typeof createCategoryMenu>;

/** The dialogs a category menu opens: one of each for the whole screen. */
export function createCategoryEdits() {
  return {
    rename: createDialogController<CategoryTarget>(),
    merge: createAlertDialogController<number>(),
    remove: createAlertDialogController<CategoryTarget>(),
  };
}
export type CategoryEdits = ReturnType<typeof createCategoryEdits>;

type Lookup = { topicsById: Map<number, Topic>; areasById: Map<number, Area> };

const ITEM = `${menuItem} gap-2.5 [&>svg]:size-4 [&>svg]:text-ink-muted`;
const DANGER_ITEM = `${menuItem} gap-2.5 text-like-text [&>svg]:size-4`;

// A press on the button must not reach the tree, which would take focus back from the menu and toggle the row.
const keepFromTree = (event: SyntheticEvent) => event.stopPropagation();

/**
 * The button on a tree row that opens its actions. It stays out of the tab
 * order, as the tree is one tab stop; the tree opens it for the keyboard.
 */
export function CategoryMenuTrigger({ menu, target, name }: { menu: CategoryMenuController; target: CategoryTarget; name: string }) {
  return (
    <MenuTrigger
      controller={menu}
      payload={target}
      tabIndex={-1}
      data-row-menu=""
      aria-label={`Actions for ${name}`}
      onPointerDown={keepFromTree}
      onMouseDown={keepFromTree}
      onClick={keepFromTree}
      className={
        "pressable -mr-1 ml-1 flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-side-muted " +
        "hover:bg-side-wash hover:text-side-ink data-open:bg-side-wash data-open:text-side-ink data-open:opacity-100 " +
        // On the selected row's wash the muted ink falls under 4.5:1, as it does for the count.
        "[[data-slot=tree-label][data-selected]>&]:text-side-ink " +
        // With a mouse the button takes the count's place while the row is pointed at or focused; on touch it has its own space.
        "[@media(hover:hover)_and_(pointer:fine)]:absolute [@media(hover:hover)_and_(pointer:fine)]:right-1.5 [@media(hover:hover)_and_(pointer:fine)]:m-0 " +
        "[@media(hover:hover)_and_(pointer:fine)]:opacity-0 [[data-slot=tree-label]:hover>&]:opacity-100 " +
        "[[data-slot=tree-item]:focus-visible>[data-slot=tree-label]>&]:opacity-100"
      }
    >
      <Ellipsis className="size-4" aria-hidden="true" />
    </MenuTrigger>
  );
}

/** What can be done to the area or topic whose row opened the menu. */
export function CategoryMenu({ menu, edits, topicsById, areasById }: { menu: CategoryMenuController; edits: CategoryEdits } & Lookup) {
  return (
    <Menu controller={menu}>
      <MenuContent<CategoryTarget> align="start" sideOffset={4} className={`${menuContent} ${pageColors}`}>
        {(state) => {
          const target = state.payload;
          if (!target) return null;
          const rename = (
            <MenuItem className={ITEM} onSelect={() => void edits.rename.open({ payload: target })}>
              <Pencil aria-hidden="true" />
              Rename…
            </MenuItem>
          );
          const remove = (
            <>
              <MenuSeparator />
              <MenuItem destructive className={DANGER_ITEM} onSelect={() => void edits.remove.open({ payload: target })}>
                <Trash2 aria-hidden="true" />
                Delete…
              </MenuItem>
            </>
          );
          const hide = (hidden: boolean, onSelect: () => void) => (
            <MenuItem className={ITEM} onSelect={onSelect}>
              {hidden ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
              {hidden ? "Unhide" : "Hide"}
            </MenuItem>
          );

          if (target.kind === "area") {
            const area = areasById.get(target.id);
            if (!area) return null;
            return (
              <>
                {rename}
                {hide(area.hidden, () => void runAction(setAreaHidden(area.id, !area.hidden)))}
                {remove}
              </>
            );
          }

          const topic = topicsById.get(target.id);
          if (!topic) return null;
          if (topic.kind === "pinned") {
            return (
              <MenuItem className={ITEM} onSelect={() => void runAction(unpin(topic.id))}>
                <PinOff aria-hidden="true" />
                Unpin
              </MenuItem>
            );
          }
          // Inside a hidden area the area decides, so the topic's own switch would change nothing on screen.
          const areaHidden = topic.hidden && !topic.hiddenSelf;
          return (
            <>
              {rename}
              <MenuItem className={ITEM} onSelect={() => void edits.merge.open({ payload: topic.id })}>
                <Merge aria-hidden="true" />
                Merge into…
              </MenuItem>
              {areaHidden ? null : hide(topic.hiddenSelf, () => void runAction(setTopicHidden(topic.id, !topic.hiddenSelf)))}
              {remove}
            </>
          );
        }}
      </MenuContent>
    </Menu>
  );
}

function RenameForm({ target, name, onDone }: { target: CategoryTarget; name: string; onDone: () => void }) {
  const [value, setValue] = useState(name);
  const [saving, startSaving] = useTransition();
  const next = value.replace(/\s+/g, " ").trim();
  const noun = target.kind;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    startSaving(async () => {
      const saved = await runAction<object>(target.kind === "topic" ? renameTopic(target.id, next) : renameArea(target.id, next));
      if (saved) onDone();
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 p-5">
      <div>
        <DialogTitle className="text-display text-[20px]">Rename {noun}</DialogTitle>
        <DialogDescription className="mt-1.5 text-[13px] leading-[1.5] text-ink-muted">
          A renamed {noun} keeps its posts, and automatic changes leave it alone from now on.
        </DialogDescription>
      </div>
      <Input
        aria-label={`Name of the ${noun}`}
        required
        maxLength={200}
        autoComplete="off"
        value={value}
        onValueChange={setValue}
        className={`${textField} h-10 px-4`}
      />
      <div className="flex justify-end gap-2">
        <DialogClose type="button" className={quietAnswer}>
          Cancel
        </DialogClose>
        <button type="submit" disabled={saving || next === "" || next === name} className={primaryAnswer}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

/** The rename, merge and delete dialogs, opened from a category menu. */
export function CategoryDialogs({ edits, topics, areas, topicsById, areasById }: { edits: CategoryEdits; topics: Topic[]; areas: Area[] } & Lookup) {
  const named = (target: CategoryTarget | undefined): Topic | Area | undefined =>
    target === undefined ? undefined : target.kind === "topic" ? topicsById.get(target.id) : areasById.get(target.id);

  return (
    <>
      <Dialog controller={edits.rename}>
        <DialogBackdrop />
        <DialogContent<CategoryTarget> className={`w-[min(26rem,calc(100%-1.5rem))] ${dialogContent}`}>
          {(state) => {
            const target = state.payload;
            const current = named(target);
            if (!target || !current) return <DialogTitle className="sr-only">Rename</DialogTitle>;
            return <RenameForm key={`${target.kind}:${target.id}`} target={target} name={current.name} onDone={() => edits.rename.close()} />;
          }}
        </DialogContent>
      </Dialog>

      <AlertDialog controller={edits.remove}>
        <AlertDialogBackdrop className={alertBackdrop} />
        <AlertDialogContent<CategoryTarget> className={alertContent}>
          {(state) => {
            const target = state.payload;
            const current = named(target);
            if (!target || !current) return <AlertDialogTitle className="sr-only">Delete</AlertDialogTitle>;
            const inArea = target.kind === "area" ? topics.filter((topic) => topic.areaId === target.id).length : 0;
            return (
              <>
                <AlertDialogTitle className="text-display text-[20px]">
                  {target.kind === "area" && inArea > 0
                    ? `Delete “${current.name}” and its ${formatCount(inArea)} ${plural(inArea, "topic")}?`
                    : `Delete “${current.name}”?`}
                </AlertDialogTitle>
                <AlertDialogDescription className="mt-2 text-[14px] leading-[1.55] text-pretty text-ink-muted">
                  Its <span className="tabular-nums">{formatCount(current.postCount)}</span> {plural(current.postCount, "post")} stay saved and fall
                  back to their other topics, or to Unfiled. {target.kind === "area" ? "These topics are" : "This topic is"} never suggested again.
                  This cannot be undone.
                </AlertDialogDescription>
                <div className="mt-5 flex justify-end gap-2">
                  <AlertDialogClose className={quietAnswer}>Cancel</AlertDialogClose>
                  <AlertDialogClose
                    value="confirm"
                    className={dangerAnswer}
                    action={async () => {
                      await runAction<object>(target.kind === "topic" ? deleteTopic(target.id) : deleteArea(target.id));
                    }}
                  >
                    Delete {target.kind}
                  </AlertDialogClose>
                </div>
              </>
            );
          }}
        </AlertDialogContent>
      </AlertDialog>

      <MergeDialog controller={edits.merge} topics={topics} areas={areas} topicsById={topicsById} />
    </>
  );
}
