#!/usr/bin/env bun
/**
 * Merge CLI: reads claude-report.json + codex-report.json,
 * merges, writes merged-report.md, sets GitHub Action outputs,
 * optionally posts PR comment via `gh pr comment`.
 *
 * Usage:
 *   bun run merge-cli.ts \
 *     --claude <claude-report.json> \
 *     --codex <codex-report.json> \
 *     --out-md <merged-report.md> \
 *     --out-json <merged-summary.json> \
 *     [--pr <number>] [--repo owner/name] [--post-comment]
 */

import { mergeReports } from "./merge-reports.ts";
import { renderReport } from "./render-report.ts";
import type { ReviewReport, CriticStatus } from "./types.ts";

type CliArgs = {
  claude: string;
  codex: string;
  outMd: string;
  outJson: string;
  pr?: string;
  repo?: string;
  postComment: boolean;
};

function parseCliArgs(argv: string[]): CliArgs {
  const args: Partial<CliArgs> = { postComment: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--claude") args.claude = argv[++i];
    else if (a === "--codex") args.codex = argv[++i];
    else if (a === "--out-md") args.outMd = argv[++i];
    else if (a === "--out-json") args.outJson = argv[++i];
    else if (a === "--pr") args.pr = argv[++i];
    else if (a === "--repo") args.repo = argv[++i];
    else if (a === "--post-comment") args.postComment = true;
  }
  for (const k of ["claude", "codex", "outMd", "outJson"] as const) {
    if (!args[k]) {
      const flag = k === "outMd" ? "out-md" : k === "outJson" ? "out-json" : k;
      console.error(`Missing required arg: --${flag}`);
      process.exit(2);
    }
  }
  return args as CliArgs;
}

async function readReport(path: string): Promise<{ report: ReviewReport; status: CriticStatus }> {
  const fs = await import("node:fs/promises");
  try {
    const raw = await fs.readFile(path, "utf-8");
    const parsed = JSON.parse(raw) as ReviewReport;
    if (parsed.parse_error) return { report: parsed, status: "failed" };
    if (!Array.isArray(parsed.findings)) return { report: { findings: [] }, status: "failed" };
    return { report: parsed, status: "ok" };
  } catch (e) {
    console.error(`[merge] failed to read ${path}: ${(e as Error).message}`);
    return { report: { findings: [] }, status: "missing" };
  }
}

async function setActionOutput(key: string, value: string | number | null): Promise<void> {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (!outputFile) return;
  const fs = await import("node:fs/promises");
  await fs.appendFile(outputFile, `${key}=${value === null ? "" : value}\n`);
}

async function postPrComment(repo: string, pr: string, body: string): Promise<string | null> {
  const fs = await import("node:fs/promises");
  const tmp = `/tmp/sdd-review-${Date.now()}.md`;
  await fs.writeFile(tmp, body);
  const proc = Bun.spawn(["gh", "pr", "comment", pr, "--repo", repo, "--body-file", tmp], {
    stdout: "pipe", stderr: "pipe",
  });
  const stdout = (await new Response(proc.stdout).text()).trim();
  const stderr = (await new Response(proc.stderr).text()).trim();
  const exit = await proc.exited;
  if (exit !== 0) {
    console.error(`[merge] gh pr comment failed: ${stderr}`);
    return null;
  }
  console.error(`[merge] posted PR comment: ${stdout}`);
  return stdout;
}

if (import.meta.main) {
  const args = parseCliArgs(process.argv.slice(2));
  const claudeReport = await readReport(args.claude);
  const codexReport = await readReport(args.codex);

  const result = mergeReports(claudeReport.report, codexReport.report, claudeReport.status, codexReport.status);
  const md = renderReport(result);

  await Bun.write(args.outMd, md);
  await Bun.write(args.outJson, JSON.stringify({
    p1_count: result.p1_count,
    p2_count: result.p2_count,
    p3_count: result.p3_count,
    agreement_score: result.agreement_score,
    claude_status: result.claude_status,
    codex_status: result.codex_status,
  }, null, 2));

  await setActionOutput("p1_count", result.p1_count);
  await setActionOutput("p2_count", result.p2_count);
  await setActionOutput("p3_count", result.p3_count);
  await setActionOutput("agreement_score", result.agreement_score);

  console.error(`[merge] P1=${result.p1_count} P2=${result.p2_count} P3=${result.p3_count} agreement=${result.agreement_score}`);

  if (args.postComment && args.pr && args.repo) {
    const url = await postPrComment(args.repo, args.pr, md);
    if (url) await setActionOutput("report_url", url);
  }
}
