import { test, expect } from "bun:test";
import { mergeReports } from "./merge-reports.ts";
import type { ReviewReport, Priority } from "./types.ts";

const finding = (priority: Priority, id: string, source = "default") => ({
  priority, assertion_id: id,
  title: `${id} from ${source}`,
  evidence: `evidence for ${id}`,
  suggested_fix: `fix ${id}`,
});

test("mergeReports: perfect agreement on all findings", () => {
  const claude: ReviewReport = { findings: [finding("P1", "a"), finding("P2", "b")] };
  const codex: ReviewReport = { findings: [finding("P1", "a"), finding("P2", "b")] };
  const result = mergeReports(claude, codex, "ok", "ok");
  expect(result.agreements.length).toBe(2);
  expect(result.claude_only.length).toBe(0);
  expect(result.codex_only.length).toBe(0);
  expect(result.agreement_score).toBe(1);
});

test("mergeReports: no overlap — agreement_score is 0", () => {
  const claude: ReviewReport = { findings: [finding("P1", "a")] };
  const codex: ReviewReport = { findings: [finding("P1", "b")] };
  const result = mergeReports(claude, codex, "ok", "ok");
  expect(result.agreements.length).toBe(0);
  expect(result.claude_only.length).toBe(1);
  expect(result.codex_only.length).toBe(1);
  expect(result.agreement_score).toBe(0);
});

test("mergeReports: partial overlap — agreement_score reflects ratio", () => {
  const claude: ReviewReport = { findings: [finding("P1", "a"), finding("P2", "b"), finding("P3", "c")] };
  const codex: ReviewReport = { findings: [finding("P1", "a"), finding("P2", "d")] };
  const result = mergeReports(claude, codex, "ok", "ok");
  expect(result.agreements.length).toBe(1);
  expect(result.claude_only.length).toBe(2);
  expect(result.codex_only.length).toBe(1);
  expect(result.agreement_score).toBeCloseTo(1 / 4, 3);
});

test("mergeReports: priority conflict resolved to highest", () => {
  const claude: ReviewReport = { findings: [{ ...finding("P1", "x"), priority: "P1" }] };
  const codex: ReviewReport = { findings: [{ ...finding("P3", "x"), priority: "P3" }] };
  const result = mergeReports(claude, codex, "ok", "ok");
  expect(result.agreements.length).toBe(1);
  expect(result.agreements[0].priority).toBe("P1");
});

test("mergeReports: empty reports", () => {
  const result = mergeReports({ findings: [] }, { findings: [] }, "ok", "ok");
  expect(result.agreements.length).toBe(0);
  expect(result.p1_count).toBe(0);
  expect(result.agreement_score).toBe(1);
});

test("mergeReports: claude failed — agreement_score is null", () => {
  const codex: ReviewReport = { findings: [finding("P1", "a")] };
  const result = mergeReports({ findings: [] }, codex, "failed", "ok");
  expect(result.codex_only.length).toBe(1);
  expect(result.agreement_score).toBeNull();
  expect(result.claude_status).toBe("failed");
});

test("mergeReports: counts are computed after dedup", () => {
  const claude: ReviewReport = { findings: [finding("P1", "a"), finding("P1", "b")] };
  const codex: ReviewReport = { findings: [finding("P1", "a"), finding("P2", "c")] };
  const result = mergeReports(claude, codex, "ok", "ok");
  expect(result.p1_count).toBe(2);
  expect(result.p2_count).toBe(1);
});
