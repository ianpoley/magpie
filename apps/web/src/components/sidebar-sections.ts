export const SECTIONS_COOKIE = "magpie-sidebar-closed";

export const parseClosedSections = (value: string | undefined): string[] => (value ? value.split(",").filter(Boolean) : []);

export function readClosedSections(): string[] {
  const cookie = document.cookie.split("; ").find((part) => part.startsWith(`${SECTIONS_COOKIE}=`));
  return parseClosedSections(cookie?.slice(SECTIONS_COOKIE.length + 1));
}

export function saveClosedSections(ids: string[]) {
  document.cookie = `${SECTIONS_COOKIE}=${ids.join(",")}; path=/; max-age=31536000; samesite=lax`;
}
