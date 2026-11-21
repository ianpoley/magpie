export type DevTools = { keys: string; panel: string };

export const CHROME_MAC: DevTools = { keys: "⌥⌘I", panel: "Application" };

export function devToolsFor(userAgent: string): DevTools {
  const mac = /Macintosh|Mac OS X/.test(userAgent);
  const storage = /Firefox\//.test(userAgent) || (/Safari\//.test(userAgent) && !/Chrome\/|Chromium\/|Edg\//.test(userAgent));
  return { keys: mac ? "⌥⌘I" : "F12", panel: storage ? "Storage" : "Application" };
}
