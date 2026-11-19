"use client";

import { Accordion, AccordionHeader, AccordionItem, AccordionPanel, AccordionTrigger } from "@ui-sdk/react/accordion";
import { DialogTrigger } from "@ui-sdk/react/dialog";
import { ChevronDown, ExternalLink, FileText, GitBranch, Package, Play, type LucideIcon } from "lucide-react";

import type { Post, ResourceGroup } from "@/lib/types";

import { AuthorAvatar } from "./author-avatar";
import { formatCount, formatDate, plural } from "./format";
import type { PostDialogController } from "./post-card";
import { iconButton } from "./styles";
import { Tip } from "./tip";

const KINDS: Record<string, { icon: LucideIcon; label: string }> = {
  repo: { icon: GitBranch, label: "Repo" },
  package: { icon: Package, label: "Package" },
  video: { icon: Play, label: "Video" },
  page: { icon: FileText, label: "Page" },
};

function PostRow({ post, dialog }: { post: Post; dialog: PostDialogController }) {
  const date = formatDate(post.createdAt);
  return (
    <li>
      <DialogTrigger
        controller={dialog}
        payload={post.id}
        className="focus-ring flex h-auto w-full cursor-pointer items-center justify-start gap-2.5 rounded-inner border-0 bg-transparent px-2.5 py-2 text-left font-normal -outline-offset-2 transition-colors duration-150 ease-out hover:bg-sunken"
      >
        <AuthorAvatar handle={post.authorHandle} name={post.authorName} url={post.authorAvatarUrl} size="sm" ring={false} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] leading-snug text-ink">
            <span className="font-semibold">{post.authorName}</span>
            {post.text ? <span className="text-ink-muted"> · {post.text}</span> : null}
          </span>
        </span>
        {date ? <span className="shrink-0 text-[12px] text-ink-muted tabular-nums">{date}</span> : null}
      </DialogTrigger>
    </li>
  );
}

/**
 * The resources the listed posts link to, most-saved first. A row opens to the
 * posts that saved it; the link beside it goes to the resource itself.
 */
export function ResourcesView({ groups, dialog }: { groups: ResourceGroup[]; dialog: PostDialogController }) {
  return (
    <Accordion multiple className="max-w-none overflow-hidden rounded-card border-0 bg-surface shadow-card">
      {groups.map(({ resource, posts }) => {
        const kind = KINDS[resource.kind] ?? KINDS.page;
        const Icon = kind.icon;
        const name = resource.title ?? resource.host ?? resource.url;
        return (
          <AccordionItem key={resource.id} value={String(resource.id)} className="border-line last:border-b-0">
            <div className="flex items-center gap-1 pr-3 transition-colors duration-150 ease-out has-[[data-slot=accordion-trigger]:hover]:bg-canvas">
              <AccordionHeader className="min-w-0 flex-1">
                <AccordionTrigger className="focus-ring group min-h-0 cursor-pointer justify-start gap-3 py-3 pr-1 pl-4 text-left -outline-offset-2">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-inner bg-sunken text-ink-muted">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] leading-tight font-semibold text-ink">{name}</span>
                    <span className="mt-0.5 block truncate text-[12px] leading-tight text-ink-muted">
                      {resource.host ?? resource.url} · {kind.label}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-chip px-2 py-0.5 text-[12px] font-semibold text-chip-text tabular-nums">
                    {formatCount(posts.length)} {plural(posts.length, "save")}
                  </span>
                  <ChevronDown className="size-4 shrink-0 text-ink-muted group-data-open:rotate-180" aria-hidden="true" />
                </AccordionTrigger>
              </AccordionHeader>
              <Tip label="Open resource">
                <a href={resource.url} target="_blank" rel="noreferrer" aria-label={`Open ${name}`} className={iconButton}>
                  <ExternalLink aria-hidden="true" />
                </a>
              </Tip>
            </div>
            <AccordionPanel className="px-2 pb-2 text-ink">
              <ul className="flex flex-col">
                {posts.map((post) => (
                  <PostRow key={post.id} post={post} dialog={dialog} />
                ))}
              </ul>
            </AccordionPanel>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
