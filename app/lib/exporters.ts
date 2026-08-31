import { isQuickWin, type AuditResult } from "./types";

/**
 * Formatos de exportación además del PDF.
 *
 * JSON es el AuditResult tipado tal cual, para que un script o un pipeline de
 * CI pueda consumirlo sin parsear texto. Markdown es para pegar en una issue,
 * una PR o un documento.
 */

export interface ExportEnvelope {
  /** Versión del formato: un consumidor externo necesita poder detectar cambios. */
  format: "ux-auditor-report@1";
  url: string;
  generatedAt: string;
  audit: AuditResult;
}

export function toJson(audit: AuditResult, url: string): string {
  const envelope: ExportEnvelope = {
    format: "ux-auditor-report@1",
    url,
    generatedAt: new Date().toISOString(),
    audit,
  };
  return JSON.stringify(envelope, null, 2);
}

/** Escapa los caracteres que romperían una celda de tabla Markdown. */
function cell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
}

export function toMarkdown(audit: AuditResult, url: string): string {
  const lines: string[] = [];
  const date = new Date().toISOString().slice(0, 10);

  lines.push(`# UX Audit — ${url}`, "");
  lines.push(`**Score: ${audit.overallScore}/100** · ${audit.checksPassed}/${audit.checksApplicable} checks passed · ${date}`, "");

  if (audit.confidence === "low") {
    lines.push(
      "> **Low confidence.** The served HTML had almost no readable content, so this scores the shell rather than what a visitor sees.",
      ""
    );
  }
  if (!audit.rendered) {
    lines.push(
      "> Markup-only audit — contrast, type size and tap-target checks were skipped because no browser was available.",
      ""
    );
  }
  if (audit.summary) lines.push(audit.summary, "");

  const scores = [
    ["Accessibility", audit.scoreBreakdown.accessibility],
    ["Visual hierarchy", audit.scoreBreakdown.visualHierarchy],
    ["UX clarity", audit.scoreBreakdown.uxClarity],
  ] as const;

  const active = scores.filter(([, v]) => v !== null);
  if (active.length > 0) {
    lines.push("| Category | Score | Checks passed |", "|---|---|---|");
    for (const [name, value] of active) {
      lines.push(`| ${name} | ${value!.score} | ${value!.rulesPassed}/${value!.rulesApplicable} |`);
    }
    lines.push("");
  }

  const quickWins = audit.findings.filter(isQuickWin);
  if (quickWins.length > 0) {
    lines.push("## Start here", "");
    lines.push("_High impact, low effort._", "");
    for (const f of quickWins) {
      lines.push(`1. **${cell(f.title)}** — ${cell(f.fix)}`);
    }
    lines.push("");
  }

  lines.push(`## Findings (${audit.findings.length})`, "");

  for (const severity of ["critical", "high", "medium", "low"] as const) {
    const group = audit.findings.filter((f) => f.severity === severity);
    if (group.length === 0) continue;

    lines.push(`### ${severity} (${group.length})`, "");
    for (const f of group) {
      const badges = [
        f.category,
        `${f.impact} impact`,
        `${f.effort} effort`,
        f.wcag ? `WCAG ${f.wcag}` : null,
        f.source === "ai" ? "AI insight" : "verified",
      ].filter(Boolean);

      lines.push(`#### ${cell(f.title)}`, "");
      lines.push(`\`${badges.join("\` · \`")}\``, "");
      if (f.description) lines.push(f.description, "");

      if (f.evidence.length > 0) {
        lines.push("**Evidence**", "");
        for (const e of f.evidence) {
          const parts = [
            e.selector ? `\`${e.selector}\`` : null,
            e.detail ?? null,
            e.snippet ? `\`${cell(e.snippet)}\`` : null,
          ].filter(Boolean);
          if (parts.length > 0) lines.push(`- ${parts.join(" — ")}`);
        }
        lines.push("");
      }

      if (f.fix) lines.push(`**Fix:** ${f.fix}`, "");
    }
  }

  if (audit.strengths) lines.push("## Strengths", "", audit.strengths, "");

  lines.push("---", "");
  lines.push(
    audit.aiEnabled
      ? "_Scores produced by a deterministic rule engine. AI observations are marked and never affect the score._"
      : "_Deterministic audit. No AI layer was used; the score is identical either way._"
  );

  return lines.join("\n");
}

/** Nombre de fichero seguro, derivado del host auditado. */
export function exportFilename(url: string, extension: string): string {
  let host = "audit";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    // URL malformada: se queda el nombre por defecto.
  }
  const safe = host.replace(/[^a-z0-9.-]/gi, "-");
  return `ux-audit-${safe}-${new Date().toISOString().slice(0, 10)}.${extension}`;
}
