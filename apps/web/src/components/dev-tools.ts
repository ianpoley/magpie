/** A page can't open dev tools, so setup names this browser's shortcut and the panel that lists cookies. */
export type DevTools = { keys: string; panel: string };

export const CHROME_MAC: DevTools = { keys: "⌥⌘I", panel: "Application" };

export function devToolsFor(userAgent: string): DevTools {
  const mac = /Macintosh|Mac OS X/.test(userAgent);
  // Chrome, Edge and Arc all say Safari too; only real Safari and Firefox call the panel Storage.
  const storage = /Firefox\//.test(userAgent) || (/Safari\//.test(userAgent) && !/Chrome\/|Chromium\/|Edg\//.test(userAgent));
  return { keys: mac ? "⌥⌘I" : "F12", panel: storage ? "Storage" : "Application" };
}
