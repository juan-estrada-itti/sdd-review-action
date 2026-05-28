#!/usr/bin/env bun
/**
 * Codex adversarial critic for SDD RFCs.
 * Reads RFC + rubric, invokes `codex exec` with the adversarial prompt,
 * emits structured JSON findings.
 *
 * Usage:
 *   bun run review-rfc.ts \
 *     --rfc <path> \
 *     --criteria <path> \
 *     --prompt <path> \
 *     --out <path> \
 *     [--reasoning low|medium|high] \
 *     [--model gpt-5]
 */

export type Priority = "P1" | "P2" | "P3";

export type Finding = {
  priority: Priority;
  assertion_id: string;
  title: string;
  evidence: string;
  suggested_fix: string;
};

export type ReviewReport = {
  findings: Finding[];
  parse_error?: string;
  raw_output?: string;
};

const REQUIRED_FINDING_FIELDS = ["priority", "assertion_id", "title", "evidence", "suggested_fix"] as const;

export function parseCodexOutput(raw: string): ReviewReport {
  const jsonStr = extractJsonBlock(raw);
  if (!jsonStr) {
    return { findings: [], parse_error: "no JSON object found in output", raw_output: raw };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    return { findings: [], parse_error: `JSON.parse failed: ${(e as Error).message}`, raw_output: raw };
  }
  if (!parsed || typeof parsed !== "object" || !("findings" in parsed) || !Array.isArray((parsed as { findings: unknown }).findings)) {
    return { findings: [], parse_error: "parsed JSON missing 'findings' array", raw_output: raw };
  }
  const findings: Finding[] = [];
  for (const f of (parsed as { findings: unknown[] }).findings) {
    if (!isValidFinding(f)) continue;
    findings.push(f);
  }
  return { findings };
}

function extractJsonBlock(raw: string): string | null {
  const fenced = raw.match(/```json\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const codeBlock = raw.match(/```\s*([\s\S]*?)```/);
  if (codeBlock && codeBlock[1].trim().startsWith("{")) return codeBlock[1].trim();
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const start = raw.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === "{") depth++;
    else if (raw[i] === "}") {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

function isValidFinding(f: unknown): f is Finding {
  if (!f || typeof f !== "object") return false;
  for (const field of REQUIRED_FINDING_FIELDS) {
    if (!(field in f)) return false;
    const v = (f as Record<string, unknown>)[field];
    if (typeof v !== "string" || v.trim() === "") return false;
  }
  const priority = (f as Record<string, unknown>).priority;
  if (priority !== "P1" && priority !== "P2" && priority !== "P3") return false;
  return true;
}

// ── CLI ──────────────────────────────────────────────────────────────

export type CliArgs = {
  rfc: string;
  criteria: string;
  prompt: string;
  out: string;
  reasoning: "low" | "medium" | "high";
  model?: string; // optional · when omitted, codex CLI uses its own default
};

export function parseCliArgs(argv: string[]): CliArgs {
  const args: Partial<CliArgs> = { reasoning: "medium" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--rfc") args.rfc = argv[++i];
    else if (a === "--criteria") args.criteria = argv[++i];
    else if (a === "--prompt") args.prompt = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--reasoning") args.reasoning = argv[++i] as CliArgs["reasoning"];
    else if (a === "--model") args.model = argv[++i];
  }
  for (const k of ["rfc", "criteria", "prompt", "out"] as const) {
    if (!args[k]) {
      console.error(`Missing required arg: --${k}`);
      process.exit(2);
    }
  }
  return args as CliArgs;
}

async function runCodexCritic(args: CliArgs): Promise<ReviewReport> {
  const fs = await import("node:fs/promises");
  const promptTemplate = await fs.readFile(args.prompt, "utf-8");
  const renderedPrompt = promptTemplate
    .replace(/\{\{RFC_PATH\}\}/g, args.rfc)
    .replace(/\{\{CRITERIA_PATH\}\}/g, args.criteria);

  const codexArgs = [
    "exec",
    "-c", `model_reasoning_effort=${args.reasoning}`,
    ...(args.model ? ["-c", `model=${args.model}`] : []),
    renderedPrompt,
  ];

  console.error(`[codex] invoking · model=${args.model ?? "<cli default>"} reasoning=${args.reasoning}`);
  const t0 = Date.now();
  // stderr: "inherit" so codex's full error output streams directly to GH Actions logs
  // without truncation (lesson L-002).
  const proc = Bun.spawn(["codex", ...codexArgs], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "inherit",
  });
  const stdout = await new Response(proc.stdout).text();
  const exit = await proc.exited;
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.error(`[codex] exit=${exit} · ${dt}s · stdout=${stdout.length}b`);

  if (exit !== 0) {
    return { findings: [], parse_error: `codex exited ${exit}`, raw_output: stdout };
  }
  return parseCodexOutput(stdout);
}

if (import.meta.main) {
  const args = parseCliArgs(process.argv.slice(2));
  const report = await runCodexCritic(args);
  await Bun.write(args.out, JSON.stringify(report, null, 2));
  const counts = {
    P1: report.findings.filter(f => f.priority === "P1").length,
    P2: report.findings.filter(f => f.priority === "P2").length,
    P3: report.findings.filter(f => f.priority === "P3").length,
  };
  console.error(`[codex] wrote ${report.findings.length} findings to ${args.out} · P1=${counts.P1} P2=${counts.P2} P3=${counts.P3}`);
  if (report.parse_error) {
    console.error(`[codex] WARN parse_error: ${report.parse_error}`);
    process.exit(0);
  }
}
