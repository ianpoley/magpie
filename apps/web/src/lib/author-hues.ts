export type AuthorHue = { bg: string; fg: string; ring: string };

export const AUTHOR_HUES: readonly AuthorHue[] = [
  { bg: "oklch(0.9 0.042 25)", fg: "oklch(0.42 0.153 25)", ring: "oklch(0.62 0.226 25)" },
  { bg: "oklch(0.9 0.06 70)", fg: "oklch(0.42 0.082 70)", ring: "oklch(0.62 0.121 70)" },
  { bg: "oklch(0.9 0.153 105)", fg: "oklch(0.42 0.08 105)", ring: "oklch(0.62 0.118 105)" },
  { bg: "oklch(0.9 0.193 135)", fg: "oklch(0.42 0.11 135)", ring: "oklch(0.62 0.163 135)" },
  { bg: "oklch(0.9 0.128 165)", fg: "oklch(0.42 0.079 165)", ring: "oklch(0.62 0.117 165)" },
  { bg: "oklch(0.9 0.123 195)", fg: "oklch(0.42 0.065 195)", ring: "oklch(0.62 0.095 195)" },
  { bg: "oklch(0.9 0.047 232)", fg: "oklch(0.42 0.077 232)", ring: "oklch(0.62 0.114 232)" },
  { bg: "oklch(0.9 0.039 275)", fg: "oklch(0.42 0.238 275)", ring: "oklch(0.62 0.185 275)" },
];

export function authorHue(handle: string): AuthorHue {
  let h = 0;
  for (const ch of handle.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AUTHOR_HUES[h % AUTHOR_HUES.length];
}
