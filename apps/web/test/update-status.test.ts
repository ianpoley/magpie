import assert from "node:assert/strict";
import { test } from "node:test";

import { shellPath } from "../src/lib/update-status.ts";

test("shellPath shortens the home folder and quotes paths a shell would split", () => {
  assert.equal(shellPath("/Users/sam/magpie", "/Users/sam"), "~/magpie");
  assert.equal(shellPath("/opt/magpie", "/Users/sam"), "/opt/magpie");
  assert.equal(shellPath("/Users/sam/my apps/magpie", "/Users/sam"), "'/Users/sam/my apps/magpie'");
  assert.equal(shellPath("/Users/sam/it's/magpie", "/Users/sam"), "'/Users/sam/it'\\''s/magpie'");
  assert.equal(shellPath("/Users/samuel/magpie", "/Users/sam"), "/Users/samuel/magpie");
});
