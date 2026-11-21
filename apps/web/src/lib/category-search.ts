import type { Area, Topic } from "./types.ts";

export type CategoryGroup = { area: Area; topics: Topic[] };

export type CategoryRows = {
  pinned: CategoryGroup[];
  unfiled: boolean;
  areas: CategoryGroup[];
  hiddenAreas: CategoryGroup[];
  hiddenTopics: { topic: Topic; area: Area }[];
};

export const UNFILED_LABEL = "Unfiled";
export const HIDDEN_LABEL = "Hidden";

export function searchCategories(rows: CategoryRows, query: string): CategoryRows {
  const needle = query.trim().toLowerCase();
  if (needle === "") return rows;
  const matches = (name: string): boolean => name.toLowerCase().includes(needle);

  const narrow = (groups: CategoryGroup[]): CategoryGroup[] =>
    groups.flatMap((group) => {
      if (matches(group.area.name)) return [group];
      const topics = group.topics.filter((topic) => matches(topic.name));
      return topics.length > 0 ? [{ area: group.area, topics }] : [];
    });

  const allHidden = matches(HIDDEN_LABEL);
  return {
    pinned: narrow(rows.pinned),
    unfiled: rows.unfiled && matches(UNFILED_LABEL),
    areas: narrow(rows.areas),
    hiddenAreas: allHidden ? rows.hiddenAreas : narrow(rows.hiddenAreas),
    hiddenTopics: allHidden ? rows.hiddenTopics : rows.hiddenTopics.filter(({ topic }) => matches(topic.name)),
  };
}

export function noCategories(rows: CategoryRows): boolean {
  return rows.pinned.length + rows.areas.length + rows.hiddenAreas.length + rows.hiddenTopics.length === 0 && !rows.unfiled;
}
