"use client";

import { Tree, TreeGroup, TreeItem, TreeItemIndicator, TreeItemLabel } from "@ui-sdk/react/tree";
import { ChevronDown, EyeOff, Inbox, Pin, type LucideIcon } from "lucide-react";

import type { Area, FilterState, Snapshot, Topic } from "@/lib/types";

import { formatCount } from "./format";

export const UNFILED_NODE = "unfiled";
export const HIDDEN_NODE = "hidden";
export const areaNode = (id: number): string => `area:${id}`;
export const topicNode = (id: number): string => `topic:${id}`;

const byCount = <T extends { postCount: number; name: string }>(a: T, b: T): number =>
  b.postCount - a.postCount || a.name.localeCompare(b.name);

const ROW =
  "h-8 rounded-[10px] text-[13px] text-side-ink data-selected:bg-side-wash data-selected:font-semibold";
// On the selected row's wash the muted ink falls under 4.5:1, so the count takes the full ink there.
const COUNT =
  "ml-auto shrink-0 pl-2 text-[12px] font-medium text-side-muted tabular-nums [[data-slot=tree-label][data-selected]>&]:text-side-ink";

function Count({ value }: { value: number }) {
  return <span className={COUNT}>{formatCount(value)}</span>;
}

function TopicRow({ topic, prefix }: { topic: Topic; prefix?: string }) {
  const node = topicNode(topic.id);
  return (
    <TreeItem value={node} data-node={node} label={topic.name}>
      <TreeItemLabel className={ROW} title={topic.definition || undefined}>
        <span className="min-w-0 truncate">
          {prefix ? <span className="text-side-muted">{prefix} › </span> : null}
          {topic.name}
        </span>
        <Count value={topic.postCount} />
      </TreeItemLabel>
    </TreeItem>
  );
}

function AreaRow({ area, topics, icon: Icon }: { area: Area; topics: Topic[]; icon?: LucideIcon }) {
  const node = areaNode(area.id);
  return (
    <TreeItem value={node} data-node={node} label={area.name}>
      <TreeItemLabel className={ROW}>
        <TreeItemIndicator className="text-side-muted transition-[rotate] duration-150 ease-out">
          <ChevronDown className="size-4" aria-hidden="true" />
        </TreeItemIndicator>
        {Icon ? <Icon className="size-3.5 shrink-0 text-side-muted" aria-hidden="true" /> : null}
        <span className="min-w-0 truncate font-semibold">{area.name}</span>
        <Count value={area.postCount} />
      </TreeItemLabel>
      <TreeGroup>
        {topics.map((topic) => (
          <TopicRow key={topic.id} topic={topic} />
        ))}
      </TreeGroup>
    </TreeItem>
  );
}

/**
 * Areas and their topics, most posts first. Pressing a row adds it to or takes
 * it out of the filter, so several can be selected at once. Hidden areas and
 * topics are listed under a collapsed group at the end.
 */
export function CategoryTree({
  snapshot,
  filter,
  expanded,
  unfiledCount,
  onExpandedChange,
  onToggleTopic,
  onToggleArea,
  onToggleUnfiled,
}: {
  snapshot: Snapshot;
  filter: FilterState;
  expanded: string[];
  unfiledCount: number;
  onExpandedChange: (expanded: string[]) => void;
  onToggleTopic: (topicId: number) => void;
  onToggleArea: (areaId: number) => void;
  onToggleUnfiled: () => void;
}) {
  const topicsOf = (area: Area, hidden: boolean): Topic[] =>
    snapshot.topics.filter((topic) => topic.areaId === area.id && (area.hidden || topic.hiddenSelf === hidden)).sort(byCount);

  const visibleAreas = snapshot.areas.filter((area) => !area.hidden);
  const pinned = visibleAreas.filter((area) => area.kind === "system" && topicsOf(area, false).length > 0);
  const areas = visibleAreas.filter((area) => area.kind !== "system").sort(byCount);
  const hiddenAreas = snapshot.areas.filter((area) => area.hidden).sort(byCount);
  const hiddenTopics = visibleAreas.flatMap((area) => topicsOf(area, true).map((topic) => ({ topic, area }))).sort((a, b) => byCount(a.topic, b.topic));
  const hiddenCount = hiddenAreas.length + hiddenTopics.length;

  const selected = [
    ...filter.topicIds.map(topicNode),
    ...filter.areaIds.map(areaNode),
    ...(filter.unfiled ? [UNFILED_NODE] : []),
  ];

  const press = (node: string) => {
    if (node === UNFILED_NODE) return onToggleUnfiled();
    if (node === HIDDEN_NODE) {
      return onExpandedChange(expanded.includes(node) ? expanded.filter((other) => other !== node) : [...expanded, node]);
    }
    const [kind, id] = node.split(":");
    if (kind === "topic") return onToggleTopic(Number(id));
    if (!selected.includes(node) && !expanded.includes(node)) onExpandedChange([...expanded, node]);
    onToggleArea(Number(id));
  };

  return (
    <Tree
      aria-label="Categories"
      mode="multiple"
      className="max-w-none"
      value={selected}
      expanded={expanded}
      expandOnPress={false}
      onExpandedChange={onExpandedChange}
      onValueChange={(_next, details) => {
        // A plain press would replace the selection; here every press toggles
        // the pressed row, and range or select-all gestures do nothing.
        if (details.reason !== "item-press") return;
        const target = details.event?.target;
        const node = target instanceof Element ? target.closest("[data-node]")?.getAttribute("data-node") : null;
        if (node) press(node);
      }}
    >
      {pinned.map((area) => (
        <AreaRow key={area.id} area={area} topics={topicsOf(area, false)} icon={Pin} />
      ))}
      <TreeItem value={UNFILED_NODE} data-node={UNFILED_NODE} label="Unfiled">
        <TreeItemLabel className={`${ROW} ps-2`}>
          <Inbox className="size-4 shrink-0 text-side-muted" aria-hidden="true" />
          <span className="truncate font-semibold">Unfiled</span>
          <Count value={unfiledCount} />
        </TreeItemLabel>
      </TreeItem>
      {areas.map((area) => (
        <AreaRow key={area.id} area={area} topics={topicsOf(area, false)} />
      ))}
      {hiddenCount > 0 ? (
        <TreeItem value={HIDDEN_NODE} data-node={HIDDEN_NODE} label="Hidden">
          <TreeItemLabel className={`${ROW} mt-2 text-side-muted`}>
            <TreeItemIndicator className="text-side-muted transition-[rotate] duration-150 ease-out">
              <ChevronDown className="size-4" aria-hidden="true" />
            </TreeItemIndicator>
            <EyeOff className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate font-semibold">Hidden</span>
            <Count value={hiddenCount} />
          </TreeItemLabel>
          <TreeGroup>
            {hiddenAreas.map((area) => (
              <AreaRow key={area.id} area={area} topics={topicsOf(area, true)} />
            ))}
            {hiddenTopics.map(({ topic, area }) => (
              <TopicRow key={topic.id} topic={topic} prefix={area.name} />
            ))}
          </TreeGroup>
        </TreeItem>
      ) : null}
    </Tree>
  );
}
