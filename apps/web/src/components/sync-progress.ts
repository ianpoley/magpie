import type { SyncState } from "../lib/types.ts";

import { formatCount } from "./format.ts";

export type PhaseStatus = "done" | "current" | "upcoming";

export type Phase = { key: string; label: string; status: PhaseStatus; detail: string | null };

const ORDER = ["x_auth", "x_bookmarks", "x_likes", "export", "markdown", "ingest", "links", "tag", "discovery", "evolve", "retag"];

const GROUPS = [
  { key: "x", stages: ["x_auth", "x_bookmarks", "x_likes", "export", "markdown"] },
  { key: "import", stages: ["ingest"] },
  { key: "links", stages: ["links"] },
  { key: "topics", stages: ["tag", "discovery", "evolve", "retag"] },
];

const NOW_DOING: Record<string, string> = {
  x_auth: "Checking your X sign-in",
  x_bookmarks: "Fetching bookmarks from X",
  x_likes: "Fetching likes from X",
  export: "Exporting from Birdclaw",
  markdown: "Preparing your posts",
  ingest: "Importing posts",
  links: "Reading the links in your posts",
  tag: "Tagging new posts",
  discovery: "Finding the topics your posts are about",
  evolve: "Updating your categories",
  retag: "Sorting every post into its topics",
};

export type SyncProgress = { firstSync: boolean; phases: Phase[]; startedAt: string | null };

function nextStage(done: string[], firstSync: boolean): string {
  const last = Math.max(-1, ...done.map((name) => ORDER.indexOf(name)));
  const rest = ORDER.slice(last + 1).filter((name) => (firstSync ? name !== "evolve" && name !== "tag" : name !== "discovery" && name !== "retag"));
  return rest[0] ?? "retag";
}

export function syncProgress(state: SyncState): SyncProgress {
  const run = state.running && state.lastRun?.status === "running" ? state.lastRun : null;
  const firstSync = state.lastCompleteRunAt === null;
  const stages = run?.stages ?? [];
  const count = (stage: string, key: string) => stages.find((entry) => entry.stage === stage)?.counts[key] ?? null;
  const next = nextStage(stages.map((entry) => entry.stage), firstSync);
  const currentIndex = Math.max(0, GROUPS.findIndex((group) => group.stages.includes(next)));
  const linksChecked = count("links", "attempted");
  const topicsFound = count("discovery", "topics");
  const labels = { x: "Fetch from X", import: "Import posts", links: "Read links", topics: firstSync ? "Find topics" : "Sort into topics" };
  const doneDetail: Record<string, string | null> = {
    x: "Bookmarks and likes",
    import: "Saved on this computer",
    links: linksChecked === null ? null : `${formatCount(linksChecked)} links checked`,
    topics: topicsFound === null ? null : `${formatCount(topicsFound)} topics found`,
  };
  const upcomingDetail: Record<string, string | null> = {
    x: null,
    import: null,
    links: null,
    topics: firstSync ? "The longest step, often 10 minutes or more" : null,
  };
  const phases = GROUPS.map((group, index): Phase => {
    const status: PhaseStatus = index < currentIndex ? "done" : index === currentIndex ? "current" : "upcoming";
    const detail = status === "done" ? doneDetail[group.key] : status === "current" ? NOW_DOING[next] : upcomingDetail[group.key];
    return { key: group.key, label: labels[group.key as keyof typeof labels], status, detail };
  });
  return { firstSync, phases, startedAt: run?.startedAt ?? null };
}
