"use client";

import { Tree, TreeGroup, TreeItem, TreeItemIndicator, TreeItemLabel } from "@ui-sdk/react/tree";
import { ChevronDown, EyeOff, Inbox, Pin, SearchX, type LucideIcon } from "lucide-react";
import { useState, type KeyboardEvent } from "react";

import { categoryCounts } from "@/lib/filter";
import { HIDDEN_LABEL, noCategories, searchCategories, UNFILED_LABEL, type CategoryRows } from "@/lib/category-search";
import type { Area, FilterState, Snapshot, Topic } from "@/lib/types";

import { CategoryMenu, CategoryMenuTrigger, createCategoryMenu, type CategoryEdits, type CategoryMenuController } from "./category-menu";
import { formatCount } from "./format";
import { Marked } from "./post-body";

export const UNFILED_NODE = "unfiled";
export const HIDDEN_NODE = "hidden";
export const areaNode = (id: number): string => `area:${id}`;
export const topicNode = (id: number): string => `topic:${id}`;

const byCount = <T extends { postCount: number; name: string }>(a: T, b: T): number =>
  b.postCount - a.postCount || a.name.localeCompare(b.name);

const ROW =
  "relative h-8 rounded-[10px] text-[13px] text-side-ink data-selected:bg-side-wash data-selected:font-semibold";
const COUNT =
  "ml-auto shrink-0 pl-2 text-[12px] font-medium text-side-muted tabular-nums [[data-slot=tree-label][data-selected]>&]:text-side-ink";
const MENU_GAP = <span className="-mr-1 ml-1 size-6 shrink-0" />;

function Count({ value }: { value: number }) {
  return <span className={COUNT}>{formatCount(value)}</span>;
}

const ROW_MENU = "[data-row-menu]";

function TopicRow({ topic, prefix, menu, query }: { topic: Topic; prefix?: string; menu: CategoryMenuController; query: string }) {
  const node = topicNode(topic.id);
  return (
    <TreeItem value={node} data-node={node} label={topic.name}>
      <TreeItemLabel className={ROW} title={topic.definition || undefined}>
        <span className="min-w-0 truncate">
          {prefix ? <span className="text-side-muted">{prefix} › </span> : null}
          <Marked text={topic.name} keyword={query} phrase />
        </span>
        <Count value={topic.postCount} />
        <CategoryMenuTrigger menu={menu} target={{ kind: "topic", id: topic.id }} name={topic.name} />
      </TreeItemLabel>
    </TreeItem>
  );
}

function AreaRow({
  area,
  topics,
  icon: Icon,
  menu,
  query,
}: {
  area: Area;
  topics: Topic[];
  icon?: LucideIcon;
  menu: CategoryMenuController;
  query: string;
}) {
  const node = areaNode(area.id);
  return (
    <TreeItem value={node} data-node={node} label={area.name}>
      <TreeItemLabel className={ROW}>
        <TreeItemIndicator className="text-side-muted transition-[rotate] duration-150 ease-out">
          <ChevronDown className="size-4" aria-hidden="true" />
        </TreeItemIndicator>
        {Icon ? <Icon className="size-3.5 shrink-0 text-side-muted" aria-hidden="true" /> : null}
        <span className="min-w-0 truncate font-semibold">
          <Marked text={area.name} keyword={query} phrase />
        </span>
        <Count value={area.postCount} />
        {area.kind === "system" ? MENU_GAP : <CategoryMenuTrigger menu={menu} target={{ kind: "area", id: area.id }} name={area.name} />}
      </TreeItemLabel>
      <TreeGroup>
        {topics.map((topic) => (
          <TopicRow key={topic.id} topic={topic} menu={menu} query={query} />
        ))}
      </TreeGroup>
    </TreeItem>
  );
}

export function CategoryTree({
  snapshot,
  filter,
  query = "",
  expanded,
  edits,
  onExpandedChange,
  onToggleTopic,
  onToggleArea,
  onToggleUnfiled,
}: {
  snapshot: Snapshot;
  filter: FilterState;
  query?: string;
  expanded: string[];
  edits: CategoryEdits;
  onExpandedChange: (expanded: string[]) => void;
  onToggleTopic: (topicId: number) => void;
  onToggleArea: (areaId: number) => void;
  onToggleUnfiled: () => void;
}) {
  const [menu] = useState(createCategoryMenu);
  const topicsById = new Map(snapshot.topics.map((topic) => [topic.id, topic]));
  const areasById = new Map(snapshot.areas.map((area) => [area.id, area]));

  const counts = categoryCounts(snapshot, filter.revealHidden);
  const shownTopics = snapshot.topics.map((topic) => ({ ...topic, postCount: counts.topics.get(topic.id) ?? 0 }));
  const shownAreas = snapshot.areas.map((area) => ({ ...area, postCount: counts.areas.get(area.id) ?? 0 }));

  const topicsOf = (area: Area, hidden: boolean): Topic[] =>
    shownTopics.filter((topic) => topic.areaId === area.id && (area.hidden || topic.hiddenSelf === hidden)).sort(byCount);

  const visibleAreas = shownAreas.filter((area) => !area.hidden);
  const group = (hidden: boolean) => (area: Area) => ({ area, topics: topicsOf(area, hidden) });
  const all: CategoryRows = {
    pinned: visibleAreas.filter((area) => area.kind === "system").map(group(false)).filter(({ topics }) => topics.length > 0),
    unfiled: true,
    areas: visibleAreas.filter((area) => area.kind !== "system").sort(byCount).map(group(false)),
    hiddenAreas: shownAreas.filter((area) => area.hidden).sort(byCount).map(group(true)),
    hiddenTopics: visibleAreas.flatMap((area) => topicsOf(area, true).map((topic) => ({ topic, area }))).sort((a, b) => byCount(a.topic, b.topic)),
  };
  const needle = query.trim();
  const searching = needle !== "";
  const { pinned, unfiled, areas, hiddenAreas, hiddenTopics } = searchCategories(all, needle);
  const hiddenCount = hiddenAreas.length + hiddenTopics.length;

  const [closed, setClosed] = useState<{ query: string; nodes: string[] }>({ query: "", nodes: [] });
  const found = [...pinned, ...areas, ...hiddenAreas].map(({ area }) => areaNode(area.id)).concat(hiddenCount > 0 ? [HIDDEN_NODE] : []);
  const closedNow = closed.query === needle ? closed.nodes : [];
  const open = searching ? found.filter((node) => !closedNow.includes(node)) : expanded;
  const setOpen = (next: string[]) => {
    if (searching) setClosed({ query: needle, nodes: found.filter((node) => !next.includes(node)) });
    else onExpandedChange(next);
  };

  const selected = [
    ...filter.topicIds.map(topicNode),
    ...filter.areaIds.map(areaNode),
    ...(filter.unfiled ? [UNFILED_NODE] : []),
  ];

  const press = (node: string) => {
    if (node === UNFILED_NODE) return onToggleUnfiled();
    if (node === HIDDEN_NODE) {
      return setOpen(open.includes(node) ? open.filter((other) => other !== node) : [...open, node]);
    }
    const [kind, id] = node.split(":");
    if (kind === "topic") return onToggleTopic(Number(id));
    if (!selected.includes(node) && !open.includes(node)) setOpen([...open, node]);
    onToggleArea(Number(id));
  };

  const openRowMenu = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
    const row = event.target instanceof Element ? event.target.closest("[data-node]") : null;
    const trigger = row?.querySelector<HTMLElement>(`:scope > [data-slot=tree-label] ${ROW_MENU}`);
    if (!trigger) return;
    event.preventDefault();
    trigger.click();
  };

  if (noCategories({ pinned, unfiled, areas, hiddenAreas, hiddenTopics })) {
    return (
      <div role="status" className="mx-0.5 flex items-start gap-2.5 rounded-[12px] bg-side-hover px-3 py-3">
        <SearchX className="mt-0.5 size-4 shrink-0 text-side-muted" aria-hidden="true" />
        <p className="min-w-0 text-[12px] leading-snug text-side-muted">
          <span className="mb-0.5 block text-[13px] font-semibold text-side-ink">No categories match</span>
          <span className="break-words">No area or topic is named like “{needle}”.</span>
        </p>
      </div>
    );
  }

  return (
    <>
      <Tree
        aria-label="Categories"
        mode="multiple"
        className="max-w-none"
        value={selected}
        expanded={open}
        expandOnPress={false}
        onExpandedChange={setOpen}
        onKeyDown={openRowMenu}
        onValueChange={(_next, details) => {
          if (details.reason !== "item-press") return;
          const target = details.event?.target;
          const node = target instanceof Element ? target.closest("[data-node]")?.getAttribute("data-node") : null;
          if (node) press(node);
        }}
      >
        {pinned.map(({ area, topics }) => (
          <AreaRow key={area.id} area={area} topics={topics} icon={Pin} menu={menu} query={needle} />
        ))}
        {unfiled ? (
          <TreeItem value={UNFILED_NODE} data-node={UNFILED_NODE} label={UNFILED_LABEL}>
            <TreeItemLabel className={`${ROW} ps-2`}>
              <Inbox className="size-4 shrink-0 text-side-muted" aria-hidden="true" />
              <span className="truncate font-semibold">
                <Marked text={UNFILED_LABEL} keyword={needle} phrase />
              </span>
              <Count value={counts.unfiled} />
              {MENU_GAP}
            </TreeItemLabel>
          </TreeItem>
        ) : null}
        {areas.map(({ area, topics }) => (
          <AreaRow key={area.id} area={area} topics={topics} menu={menu} query={needle} />
        ))}
        {hiddenCount > 0 ? (
          <TreeItem value={HIDDEN_NODE} data-node={HIDDEN_NODE} label={HIDDEN_LABEL}>
            <TreeItemLabel className={`${ROW} mt-2 text-side-muted`}>
              <TreeItemIndicator className="text-side-muted transition-[rotate] duration-150 ease-out">
                <ChevronDown className="size-4" aria-hidden="true" />
              </TreeItemIndicator>
              <EyeOff className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate font-semibold">
                <Marked text={HIDDEN_LABEL} keyword={needle} phrase />
              </span>
              <Count value={hiddenCount} />
              {MENU_GAP}
            </TreeItemLabel>
            <TreeGroup>
              {hiddenAreas.map(({ area, topics }) => (
                <AreaRow key={area.id} area={area} topics={topics} menu={menu} query={needle} />
              ))}
              {hiddenTopics.map(({ topic, area }) => (
                <TopicRow key={topic.id} topic={topic} prefix={area.name} menu={menu} query={needle} />
              ))}
            </TreeGroup>
          </TreeItem>
        ) : null}
      </Tree>
      <CategoryMenu menu={menu} edits={edits} topicsById={topicsById} areasById={areasById} />
    </>
  );
}
