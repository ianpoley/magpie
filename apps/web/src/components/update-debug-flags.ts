import { defineDebugFlags } from "../lib/debug-flags/define.ts";
import type { UpdateState } from "../lib/update-status.ts";

const UPDATE_KINDS = ["release", "manual-release", "applying", "failed", "pending", "updated"] as const;

export const updateDebugFlags = defineDebugFlags("update-notice", {
  update: {
    label: "Update notice",
    description: "Show the sidebar update row in this state. updated is the Reload row after an update applies.",
    control: { type: "enum", options: UPDATE_KINDS },
  },
});

export type UpdateKind = (typeof UPDATE_KINDS)[number] | "default";

const COMMAND = "cd ~/magpie && bun run setup";
const LOG = "error: bun install failed\n  lockfile had changes, but lockfile is frozen";

const FAKE_UPDATES: Record<Exclude<UpdateKind, "default" | "updated">, UpdateState> = {
  release: { kind: "release", installed: "0.4.0", latest: "debug-0.5.0", url: "https://github.com", autoApplies: true, command: "cd ~/magpie && git pull" },
  "manual-release": { kind: "release", installed: "0.4.0", latest: "debug-0.5.0", url: "https://github.com", autoApplies: false, command: `cd ~/magpie && git pull && bun run setup` },
  applying: { kind: "applying", startedAt: "2026-01-01T00:00:00.000Z" },
  failed: { kind: "failed", log: LOG, command: COMMAND },
  pending: { kind: "pending", command: COMMAND },
};

export function debugUpdate(real: { update: UpdateState | null; updated: boolean }, kind: UpdateKind): { update: UpdateState | null; updated: boolean } {
  if (kind === "default") return real;
  if (kind === "updated") return { update: null, updated: true };
  return { update: FAKE_UPDATES[kind], updated: false };
}
