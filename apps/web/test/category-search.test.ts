import assert from "node:assert/strict";
import { test } from "node:test";

import { storedSidebarWidth } from "../src/components/sidebar-width.ts";
import { noCategories, searchCategories, type CategoryRows } from "../src/lib/category-search.ts";
import { area, topic } from "./fixtures/snapshot.ts";

const pinnedArea = area(1, "Pinned", { kind: "system" });
const design = area(2, "Design");
const code = area(3, "Code");
const oldArea = area(4, "Archive", { hidden: true });

const rows: CategoryRows = {
  pinned: [{ area: pinnedArea, topics: [topic(10, 1, "motion in interfaces", { kind: "pinned" })] }],
  unfiled: true,
  areas: [
    { area: design, topics: [topic(20, 2, "Typography"), topic(21, 2, "Color systems")] },
    { area: code, topics: [topic(30, 3, "Rust"), topic(31, 3, "Type systems")] },
  ],
  hiddenAreas: [{ area: oldArea, topics: [topic(40, 4, "Crypto")] }],
  hiddenTopics: [{ topic: topic(22, 2, "Logo trivia", { hidden: true, hiddenSelf: true }), area: design }],
};

const names = (found: CategoryRows) => ({
  pinned: found.pinned.map((group) => [group.area.name, ...group.topics.map((t) => t.name)]),
  unfiled: found.unfiled,
  areas: found.areas.map((group) => [group.area.name, ...group.topics.map((t) => t.name)]),
  hiddenAreas: found.hiddenAreas.map((group) => [group.area.name, ...group.topics.map((t) => t.name)]),
  hiddenTopics: found.hiddenTopics.map(({ topic: t }) => t.name),
});

const NOTHING = { pinned: [], unfiled: false, areas: [], hiddenAreas: [], hiddenTopics: [] };

test("a query matching one topic returns it under its area and nothing else", () => {
  assert.deepEqual(names(searchCategories(rows, "rust")), { ...NOTHING, areas: [["Code", "Rust"]] });
});

test("a query matching an area name returns the area with all its topics", () => {
  assert.deepEqual(names(searchCategories(rows, "design")), { ...NOTHING, areas: [["Design", "Typography", "Color systems"]] });
});

test("matching ignores case and surrounding whitespace", () => {
  assert.deepEqual(names(searchCategories(rows, "  TYPO ")), { ...NOTHING, areas: [["Design", "Typography"]] });
});

test("a query can match topics in several areas", () => {
  assert.deepEqual(names(searchCategories(rows, "systems")).areas, [
    ["Design", "Color systems"],
    ["Code", "Type systems"],
  ]);
});

test("an empty or blank query returns the full tree", () => {
  assert.equal(searchCategories(rows, ""), rows);
  assert.equal(searchCategories(rows, "   "), rows);
});

test("pinned, unfiled, and hidden rows follow the same rule", () => {
  assert.deepEqual(names(searchCategories(rows, "motion")), { ...NOTHING, pinned: [["Pinned", "motion in interfaces"]] });
  assert.deepEqual(names(searchCategories(rows, "pinned")), { ...NOTHING, pinned: [["Pinned", "motion in interfaces"]] });
  assert.deepEqual(names(searchCategories(rows, "unfil")), { ...NOTHING, unfiled: true });
  assert.deepEqual(names(searchCategories(rows, "crypto")), { ...NOTHING, hiddenAreas: [["Archive", "Crypto"]] });
  assert.deepEqual(names(searchCategories(rows, "logo")), { ...NOTHING, hiddenTopics: ["Logo trivia"] });
  assert.deepEqual(names(searchCategories(rows, "hidden")), { ...NOTHING, hiddenAreas: [["Archive", "Crypto"]], hiddenTopics: ["Logo trivia"] });
});

test("a query matching nothing returns an empty tree", () => {
  const found = searchCategories(rows, "zzz");
  assert.deepEqual(names(found), NOTHING);
  assert.equal(noCategories(found), true);
  assert.equal(noCategories(rows), false);
});

test("a stored sidebar width that is not a number or is out of range is not used", () => {
  assert.equal(storedSidebarWidth("300"), 300);
  assert.equal(storedSidebarWidth("220"), 220);
  assert.equal(storedSidebarWidth("440"), 440);
  assert.equal(storedSidebarWidth(null), null);
  assert.equal(storedSidebarWidth(""), null);
  assert.equal(storedSidebarWidth("wide"), null);
  assert.equal(storedSidebarWidth("NaN"), null);
  assert.equal(storedSidebarWidth("100"), null);
  assert.equal(storedSidebarWidth("5000"), null);
});
