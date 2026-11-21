import assert from "node:assert/strict";
import { test } from "node:test";

import { devToolsFor } from "../src/components/dev-tools.ts";

const UA = {
  chromeMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  edgeWindows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
  safariMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  firefoxLinux: "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0",
};

test("Chrome-based browsers say Safari too, and still get Application; Safari and Firefox get Storage", () => {
  assert.deepEqual(devToolsFor(UA.chromeMac), { keys: "⌥⌘I", panel: "Application" });
  assert.deepEqual(devToolsFor(UA.edgeWindows), { keys: "F12", panel: "Application" });
  assert.deepEqual(devToolsFor(UA.safariMac), { keys: "⌥⌘I", panel: "Storage" });
  assert.deepEqual(devToolsFor(UA.firefoxLinux), { keys: "F12", panel: "Storage" });
});
