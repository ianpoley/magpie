"use client";

import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxGroup, ComboboxGroupLabel, ComboboxInput, ComboboxItem, ComboboxList } from "@ui-sdk/react/combobox";
import { useState } from "react";

import type { Area, Topic } from "@/lib/types";

import { menuItem, popupList, textField } from "./styles";

/**
 * A search field over existing topics, grouped by area. With `resetOnChoose`
 * a choice is reported and the field empties for the next one; without it the
 * field keeps showing the chosen topic.
 */
export function TopicCombobox({
  label,
  placeholder,
  topics,
  areas,
  value,
  resetOnChoose = false,
  disabled = false,
  onChoose,
}: {
  label: string;
  placeholder: string;
  topics: Topic[];
  areas: Area[];
  value: number | null;
  resetOnChoose?: boolean;
  disabled?: boolean;
  onChoose: (topicId: number | null) => void;
}) {
  const [query, setQuery] = useState("");
  const names = new Map(topics.map((topic) => [String(topic.id), topic.name]));
  const groups = areas
    .map((area) => ({ area, topics: topics.filter((topic) => topic.areaId === area.id).sort((a, b) => a.name.localeCompare(b.name)) }))
    .filter((group) => group.topics.length > 0);

  return (
    <Combobox<string>
      autoHighlight
      disabled={disabled}
      value={value === null ? null : String(value)}
      query={query}
      itemToLabel={(id) => names.get(id) ?? ""}
      onQueryChange={setQuery}
      onValueChange={(next, details) => {
        if (resetOnChoose && next !== null) {
          details.cancel();
          setQuery("");
        }
        onChoose(next === null ? null : Number(next));
      }}
    >
      <ComboboxInput
        aria-label={label}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className={`${textField} h-9 shrink-0 px-3.5`}
      />
      <ComboboxContent sideOffset={6} className={popupList}>
        <ComboboxEmpty>No topic matches.</ComboboxEmpty>
        <ComboboxList>
          {groups.map(({ area, topics: inArea }) => (
            <ComboboxGroup key={area.id}>
              <ComboboxGroupLabel className="text-eyebrow px-2 pt-2 pb-1 text-ink-muted">{area.name}</ComboboxGroupLabel>
              {inArea.map((topic) => (
                <ComboboxItem key={topic.id} value={String(topic.id)} label={topic.name} keywords={[area.name]} className={menuItem}>
                  <span className="min-w-0 truncate">{topic.name}</span>
                </ComboboxItem>
              ))}
            </ComboboxGroup>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
