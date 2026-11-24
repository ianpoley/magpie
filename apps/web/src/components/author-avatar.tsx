import { Avatar, AvatarFallback, AvatarImage } from "@ui-sdk/react/avatar";

import { authorHue } from "@/lib/author-hues";

import { initials } from "./format";

const SIZES = {
  xs: "size-5 rounded-[6px] text-[9px]",
  sm: "size-6 rounded-[8px] text-[10px]",
  md: "size-10 rounded-avatar text-[13px]",
  list: "size-8 rounded-[10px] text-[12px] sm:size-10 sm:rounded-avatar sm:text-[13px]",
  lg: "size-12 rounded-avatar text-[15px]",
};

export function AuthorAvatar({
  handle,
  name,
  url,
  size = "md",
  ring = true,
}: {
  handle: string;
  name: string;
  url: string | null;
  size?: keyof typeof SIZES;
  ring?: boolean;
}) {
  const hue = authorHue(handle);
  return (
    <Avatar
      className={`${SIZES[size]} font-bold`}
      style={{
        background: hue.bg,
        color: hue.fg,
        boxShadow: ring ? `0 0 0 2px var(--color-surface), 0 0 0 3.5px ${hue.ring}` : undefined,
      }}
    >
      {url ? <AvatarImage src={url} alt="" loading="lazy" referrerPolicy="no-referrer" /> : null}
      <AvatarFallback aria-hidden="true">{initials(name || handle)}</AvatarFallback>
    </Avatar>
  );
}
