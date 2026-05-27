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
};

export type CriticStatus = "ok" | "failed" | "missing";

export type MergedFinding = {
  priority: Priority;
  assertion_id: string;
  claude?: Finding;
  codex?: Finding;
  source: "agreement" | "claude_only" | "codex_only";
};

export type MergeResult = {
  agreements: MergedFinding[];
  claude_only: MergedFinding[];
  codex_only: MergedFinding[];
  p1_count: number;
  p2_count: number;
  p3_count: number;
  agreement_score: number | null;
  claude_status: CriticStatus;
  codex_status: CriticStatus;
};
