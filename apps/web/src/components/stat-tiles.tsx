import { Bookmark, Heart, Layers, Users, type LucideIcon } from "lucide-react";

import type { Stats } from "@/lib/types";

import { formatCount } from "./format";

type Tile = { key: keyof Stats; label: string; icon: LucideIcon; wash: string; chip: string; text: string };

const TILES: Tile[] = [
  {
    key: "posts",
    label: "Saved posts",
    icon: Layers,
    wash: "bg-tile-primary-soft",
    chip: "from-primary-top to-primary",
    text: "text-primary-text",
  },
  { key: "bookmarks", label: "Bookmarks", icon: Bookmark, wash: "bg-tile-bm-soft", chip: "from-bm to-bm-text", text: "text-bm-text" },
  { key: "likes", label: "Likes", icon: Heart, wash: "bg-tile-like-soft", chip: "from-like to-like-text", text: "text-like-text" },
  { key: "authors", label: "Authors", icon: Users, wash: "bg-tile-wash", chip: "from-side-2 to-side-1", text: "text-side-1" },
];

/** Saved posts, bookmarks, likes, and authors under the current filter. */
export function StatTiles({ stats }: { stats: Stats }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {TILES.map(({ key, label, icon: Icon, wash, chip, text }) => (
        <li key={key} className={`${wash} flex items-center gap-3 rounded-card bg-surface p-3.5 shadow-card`}>
          <span
            className={`flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-linear-to-b ${chip} text-on-primary shadow-[inset_0_1px_0_oklch(1_0_0/0.2)]`}
          >
            <Icon className="size-[18px]" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className={`text-[22px] leading-none font-extrabold tracking-[-0.03em] tabular-nums ${text}`}>
              {formatCount(stats[key])}
            </p>
            <p className="mt-1.5 truncate text-[12px] leading-none font-medium text-ink-muted">{label}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
