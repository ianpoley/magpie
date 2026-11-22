export const SIDEBAR_WIDTH = { min: 220, max: 440, fallback: 272, step: 16, mainMin: 600 } as const;
export const SIDEBAR_WIDTH_KEY = "magpie:sidebar-width";
export const SIDEBAR_WIDTH_VAR = "--sidebar-width";

export function sidebarWidthWithin(stored: string | null, min: number, max: number): number | null {
  if (stored === null || stored.trim() === "") return null;
  const width = Number(stored);
  return width >= min && width <= max ? width : null;
}

export function storedSidebarWidth(stored: string | null): number | null {
  return sidebarWidthWithin(stored, SIDEBAR_WIDTH.min, SIDEBAR_WIDTH.max);
}

export function clampSidebarWidth(width: number, max: number = SIDEBAR_WIDTH.max): number {
  return Math.round(Math.min(Math.max(width, SIDEBAR_WIDTH.min), Math.max(SIDEBAR_WIDTH.min, Math.min(max, SIDEBAR_WIDTH.max))));
}

export const SIDEBAR_LIMITS_CSS =
  `:root{--sidebar-min:${SIDEBAR_WIDTH.min}px;--sidebar-max:${SIDEBAR_WIDTH.max}px;` +
  `--sidebar-fallback:${SIDEBAR_WIDTH.fallback}px;--main-min:${SIDEBAR_WIDTH.mainMin}px}`;

export const SIDEBAR_WIDTH_SCRIPT =
  `(function(){try{var w=(${sidebarWidthWithin.toString()})(localStorage.getItem(${JSON.stringify(SIDEBAR_WIDTH_KEY)}),` +
  `${SIDEBAR_WIDTH.min},${SIDEBAR_WIDTH.max});` +
  `if(w!==null)document.documentElement.style.setProperty(${JSON.stringify(SIDEBAR_WIDTH_VAR)},w+"px")}catch(e){}})()`;
