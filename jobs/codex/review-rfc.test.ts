import { test, expect } from "bun:test";
import { parseCodexOutput, parseCliArgs } from "./review-rfc.ts";

test("parseCodexOutput extracts JSON from clean Codex response", () => {
  const raw = `{
  "findings": [
    {
      "priority": "P1",
      "assertion_id": "rfc-no-tbd",
      "title": "RFC contains TBD in section 3",
      "evidence": "Decision: TBD — to be confirmed",
      "suggested_fix": "Resolve the TBD by citing the source-of-truth or removing the decision"
    }
  ]
}`;
  const result = parseCodexOutput(raw);
  expect(result.findings.length).toBe(1);
  expect(result.findings[0].priority).toBe("P1");
  expect(result.findings[0].assertion_id).toBe("rfc-no-tbd");
});

test("parseCodexOutput handles JSON wrapped in markdown fence", () => {
  const raw = `Sure, here is the analysis:

\`\`\`json
{
  "findings": [
    { "priority": "P2", "assertion_id": "rfc-no-vague-language", "title": "Vague", "evidence": "rápido", "suggested_fix": "Add p95 target" }
  ]
}
\`\`\`

Hope that helps!`;
  const result = parseCodexOutput(raw);
  expect(result.findings.length).toBe(1);
  expect(result.findings[0].priority).toBe("P2");
});

test("parseCodexOutput returns empty findings on malformed output", () => {
  const raw = `oops, not JSON at all`;
  const result = parseCodexOutput(raw);
  expect(result.findings).toEqual([]);
  expect(result.parse_error).toBeDefined();
});

test("parseCodexOutput filters findings missing required fields", () => {
  const raw = `{
  "findings": [
    { "priority": "P1", "assertion_id": "x", "title": "ok", "evidence": "quote", "suggested_fix": "do thing" },
    { "priority": "P1", "title": "missing assertion_id" },
    { "priority": "P1", "assertion_id": "y", "title": "missing evidence", "suggested_fix": "do" }
  ]
}`;
  const result = parseCodexOutput(raw);
  expect(result.findings.length).toBe(1);
  expect(result.findings[0].assertion_id).toBe("x");
});

test("parseCliArgs reads required args and defaults", () => {
  const args = parseCliArgs([
    "--rfc", "rfc.md",
    "--criteria", "crit.yaml",
    "--prompt", "p.md",
    "--out", "o.json",
  ]);
  expect(args.rfc).toBe("rfc.md");
  expect(args.reasoning).toBe("medium");
  expect(args.model).toBe("gpt-5");
});

test("parseCliArgs respects --reasoning and --model overrides", () => {
  const args = parseCliArgs([
    "--rfc", "r", "--criteria", "c", "--prompt", "p", "--out", "o",
    "--reasoning", "high",
    "--model", "gpt-5-pro",
  ]);
  expect(args.reasoning).toBe("high");
  expect(args.model).toBe("gpt-5-pro");
});
