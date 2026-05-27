import type { MergeResult, MergedFinding, Priority } from "./types.ts";

const PRIORITY_EMOJI: Record<Priority, string> = { P1: "🔴", P2: "🟡", P3: "🟢" };

function renderFinding(f: MergedFinding): string {
  const emoji = PRIORITY_EMOJI[f.priority];
  const source = f.claude ?? f.codex;
  if (!source) return "";
  return [
    `#### ${emoji} [${f.priority}] \`${f.assertion_id}\``,
    "",
    source.title,
    "",
    `> ${source.evidence.replace(/\n/g, " ")}`,
    "",
    `**Fix sugerido:** ${source.suggested_fix}`,
    "",
  ].join("\n");
}

function renderSection(title: string, findings: MergedFinding[]): string {
  if (findings.length === 0) return "";
  const sortedByPriority = [...findings].sort((a, b) => {
    const rank: Record<Priority, number> = { P1: 0, P2: 1, P3: 2 };
    return rank[a.priority] - rank[b.priority];
  });
  return [
    `### ${title} (${findings.length})`,
    "",
    ...sortedByPriority.map(renderFinding),
  ].join("\n");
}

export function renderReport(merge: MergeResult): string {
  const total = merge.p1_count + merge.p2_count + merge.p3_count;
  const score = merge.agreement_score === null
    ? "N/A (only one critic ran)"
    : `${(merge.agreement_score * 100).toFixed(0)}% (${merge.agreements.length}/${total} coinciden)`;

  const claudeBanner = merge.claude_status === "failed" ? "\n⚠️ **Claude critic unavailable** — showing Codex-only findings.\n" : "";
  const codexBanner = merge.codex_status === "failed" ? "\n⚠️ **Codex critic unavailable** — showing Claude-only findings.\n" : "";

  if (total === 0 && merge.claude_status === "ok" && merge.codex_status === "ok") {
    return [
      `## 🔍 SDD Review · RFC adversarial`,
      "",
      "✅ no findings — RFC clears the rubric.",
      "",
      `<sub>Generado por [sdd-review-action](https://github.com/ittidigital/sdd-review-action)</sub>`,
    ].join("\n");
  }

  return [
    `## 🔍 SDD Review · RFC adversarial`,
    "",
    claudeBanner,
    codexBanner,
    `| Métrica | Valor |`,
    `|---|---:|`,
    `| Total findings | ${total} |`,
    `| 🔴 P1 (críticos) | ${merge.p1_count} |`,
    `| 🟡 P2 (gaps) | ${merge.p2_count} |`,
    `| 🟢 P3 (mejoras) | ${merge.p3_count} |`,
    `| 🤝 Agreement score | ${score} |`,
    "",
    "---",
    "",
    renderSection("✅ Coincidencias — alta confianza", merge.agreements),
    renderSection("⚠️ Solo Claude", merge.claude_only),
    renderSection("⚠️ Solo Codex", merge.codex_only),
    "---",
    "",
    `<sub>Generado por [sdd-review-action](https://github.com/ittidigital/sdd-review-action)</sub>`,
  ].filter(Boolean).join("\n");
}
