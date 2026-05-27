import { test, expect } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const EXPECTED_HASH = "5b0ecd0cac99850d777ad6272ee4828428acd49b71ad31955f84f3c98d9f616d";

test("prompts/adversarial-rfc.md is unchanged · update EXPECTED_HASH after intentional edits", () => {
  const path = join(import.meta.dir, "../../prompts/adversarial-rfc.md");
  const content = readFileSync(path, "utf-8");
  const actual = createHash("sha256").update(content).digest("hex");
  expect(actual).toBe(EXPECTED_HASH);
});
