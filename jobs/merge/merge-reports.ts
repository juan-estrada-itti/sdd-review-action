import type { Finding, MergedFinding, MergeResult, Priority, ReviewReport, CriticStatus } from "./types.ts";

const PRIORITY_RANK: Record<Priority, number> = { P1: 3, P2: 2, P3: 1 };

function higherPriority(a: Priority, b: Priority): Priority {
  return PRIORITY_RANK[a] >= PRIORITY_RANK[b] ? a : b;
}

export function mergeReports(
  claude: ReviewReport,
  codex: ReviewReport,
  claude_status: CriticStatus,
  codex_status: CriticStatus,
): MergeResult {
  const byId = new Map<string, { claude?: Finding; codex?: Finding }>();
  for (const f of claude.findings) {
    const e = byId.get(f.assertion_id) ?? {};
    e.claude = f;
    byId.set(f.assertion_id, e);
  }
  for (const f of codex.findings) {
    const e = byId.get(f.assertion_id) ?? {};
    e.codex = f;
    byId.set(f.assertion_id, e);
  }

  const agreements: MergedFinding[] = [];
  const claude_only: MergedFinding[] = [];
  const codex_only: MergedFinding[] = [];

  for (const [assertion_id, entry] of byId.entries()) {
    if (entry.claude && entry.codex) {
      agreements.push({
        priority: higherPriority(entry.claude.priority, entry.codex.priority),
        assertion_id,
        claude: entry.claude,
        codex: entry.codex,
        source: "agreement",
      });
    } else if (entry.claude) {
      claude_only.push({
        priority: entry.claude.priority,
        assertion_id,
        claude: entry.claude,
        source: "claude_only",
      });
    } else if (entry.codex) {
      codex_only.push({
        priority: entry.codex.priority,
        assertion_id,
        codex: entry.codex,
        source: "codex_only",
      });
    }
  }

  const all: MergedFinding[] = [...agreements, ...claude_only, ...codex_only];
  const p1_count = all.filter(f => f.priority === "P1").length;
  const p2_count = all.filter(f => f.priority === "P2").length;
  const p3_count = all.filter(f => f.priority === "P3").length;

  const total = all.length;
  let agreement_score: number | null;
  if (claude_status === "failed" || codex_status === "failed" || claude_status === "missing" || codex_status === "missing") {
    agreement_score = null;
  } else if (total === 0) {
    agreement_score = 1;
  } else {
    agreement_score = agreements.length / total;
  }

  return {
    agreements,
    claude_only,
    codex_only,
    p1_count,
    p2_count,
    p3_count,
    agreement_score,
    claude_status,
    codex_status,
  };
}
