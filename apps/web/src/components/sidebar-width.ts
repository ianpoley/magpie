export const SIDEBAR_WIDTH = { min: 220, max: 440, fallback: 272, step: 16 } as const;
export const SIDEBAR_WIDTH_KEY = "magpie:sidebar-width";
export const SIDEBAR_WIDTH_VAR = "--sidebar-width";

export function storedSidebarWidth(stored: string | null): number | null {
  if (stored === null || stored.trim() === "") return null;
  const width = Number(stored);
  return width >= SIDEBAR_WIDTH.min && width <= SIDEBAR_WIDTH.max ? width : null;
}

export function clampSidebarWidth(width: number, max: number = SIDEBAR_WIDTH.max): number {
  return Math.round(Math.min(Math.max(width, SIDEBAR_WIDTH.min), Math.max(SIDEBAR_WIDTH.min, Math.min(max, SIDEBAR_WIDTH.max))));
}

export const SIDEBAR_WIDTH_SCRIPT =
  `(function(){try{var s=localStorage.getItem(${JSON.stringify(SIDEBAR_WIDTH_KEY)});if(s===null||s.trim()==="")return;var w=Number(s);` +
  `if(w>=${SIDEBAR_WIDTH.min}&&w<=${SIDEBAR_WIDTH.max})document.documentElement.style.setProperty(${JSON.stringify(SIDEBAR_WIDTH_VAR)},w+"px")}catch(e){}})()`;
