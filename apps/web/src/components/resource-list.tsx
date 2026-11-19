import { FileText, GitBranch, Package, Play, type LucideIcon } from "lucide-react";

import type { ResourceGroup } from "@/lib/types";

import { formatCount, plural } from "./format";

const KIND_ICONS: Record<string, LucideIcon> = { repo: GitBranch, package: Package, video: Play, page: FileText };

/** The resources the filtered posts link to, most-saved first. */
export function ResourceList({ groups }: { groups: ResourceGroup[] }) {
  return (
    <ol className="overflow-hidden rounded-card bg-surface shadow-card">
      {groups.map(({ resource, posts }) => {
        const Icon = KIND_ICONS[resource.kind] ?? FileText;
        return (
          <li key={resource.id} className="border-b border-line last:border-b-0">
            <a
              href={resource.url}
              target="_blank"
              rel="noreferrer"
              className="focus-ring flex items-center gap-3 px-4 py-3 no-underline -outline-offset-2 transition-colors duration-150 ease-out hover:bg-canvas"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-sunken text-ink-muted">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] leading-tight font-semibold text-ink">{resource.title ?? resource.host ?? resource.url}</span>
                <span className="mt-0.5 block truncate text-[12px] leading-tight text-ink-muted">{resource.host ?? resource.url}</span>
              </span>
              <span className="shrink-0 rounded-full bg-chip px-2 py-0.5 text-[12px] font-semibold text-chip-text tabular-nums">
                {formatCount(posts.length)} {plural(posts.length, "post")}
              </span>
            </a>
          </li>
        );
      })}
    </ol>
  );
}
