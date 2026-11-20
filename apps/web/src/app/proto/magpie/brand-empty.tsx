"use client";
// Throwaway: the production EmptyState, with the direction's art in place of the icon tile when it has some.

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { EmptyState as GroveEmptyState } from "@/components/empty-state";

import { useBrand } from "./brand";

export function EmptyState(props: { icon: LucideIcon; title: string; children: ReactNode; action?: ReactNode }) {
  const { brand } = useBrand();
  const Art = brand.EmptyArt;
  if (!Art) return <GroveEmptyState {...props} />;
  return (
    <div className="flex flex-col items-center rounded-card bg-surface px-6 py-12 text-center shadow-card">
      <div className="mb-5">
        <Art />
      </div>
      <h2 className="text-display text-[20px] text-ink">{props.title}</h2>
      <p className="mt-2 max-w-[42ch] text-[14px] leading-[1.55] text-pretty text-ink-muted">{props.children}</p>
      {props.action ? <div className="mt-6">{props.action}</div> : null}
    </div>
  );
}
