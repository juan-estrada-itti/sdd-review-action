import { test, expect } from "bun:test";
import { renderReport } from "./render-report.ts";
import { mergeReports } from "./merge-reports.ts";
import type { ReviewReport, Priority } from "./types.ts";

const f = (priority: Priority, id: string) => ({
  priority, assertion_id: id,
  title: `Title ${id}`,
  evidence: `Evidence for ${id}`,
  suggested_fix: `Fix ${id}`,
});

test("renderReport: includes summary table with counts", () => {
  const merged = mergeReports(
    { findings: [f("P1", "a")] },
    { findings: [f("P1", "a")] },
    "ok", "ok",
  );
  const md = renderReport(merged);
  expect(md).toContain("SDD Review");
  expect(md).toContain("Agreement score");
  expect(md).toContain("P1");
});

test("renderReport: lists agreements first", () => {
  const merged = mergeReports(
    { findings: [f("P1", "agreed"), f("P2", "claude_one")] },
    { findings: [f("P1", "agreed"), f("P3", "codex_one")] },
    "ok", "ok",
  );
  const md = renderReport(merged);
  const idxAgree = md.indexOf("agreed");
  const idxClaudeOnly = md.indexOf("claude_one");
  const idxCodexOnly = md.indexOf("codex_one");
  expect(idxAgree).toBeGreaterThan(0);
  expect(idxAgree).toBeLessThan(idxClaudeOnly);
  expect(idxAgree).toBeLessThan(idxCodexOnly);
});

test("renderReport: shows 'critic unavailable' when one critic failed", () => {
  const merged = mergeReports(
    { findings: [] },
    { findings: [f("P1", "x")] },
    "failed", "ok",
  );
  const md = renderReport(merged);
  expect(md).toContain("Claude critic unavailable");
});

test("renderReport: agreement_score null is rendered as 'N/A'", () => {
  const merged = mergeReports(
    { findings: [] },
    { findings: [f("P1", "x")] },
    "failed", "ok",
  );
  const md = renderReport(merged);
  expect(md).toContain("N/A");
});

test("renderReport: empty findings shows 'no findings'", () => {
  const merged = mergeReports({ findings: [] }, { findings: [] }, "ok", "ok");
  const md = renderReport(merged);
  expect(md).toMatch(/no findings|0 findings/i);
});
