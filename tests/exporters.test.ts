import { describe, expect, it } from "vitest";
import { exportFilename, toJson, toMarkdown, type ExportEnvelope } from "@/app/lib/exporters";
import type { AuditFinding, AuditResult } from "@/app/lib/types";

function finding(over: Partial<AuditFinding> = {}): AuditFinding {
  return {
    id: "a11y-h1",
    category: "accessibility",
    severity: "high",
    impact: "high",
    effort: "low",
    title: "No H1 heading",
    description: "The page has no H1.",
    fix: "Add exactly one H1.",
    evidence: [{ selector: "h1", detail: "0 found" }],
    wcag: "1.3.1",
    source: "rule",
    ...over,
  };
}

function audit(over: Partial<AuditResult> = {}): AuditResult {
  return {
    version: 2,
    overallScore: 62,
    scoreBreakdown: {
      accessibility: { score: 60, rulesApplicable: 12, rulesPassed: 8 },
      visualHierarchy: { score: 70, rulesApplicable: 4, rulesPassed: 3 },
      uxClarity: null,
    },
    checksPassed: 11,
    checksApplicable: 16,
    confidence: "high",
    confidenceReason: null,
    rendered: true,
    findings: [finding()],
    summary: "A summary.",
    quickWins: "",
    strengths: "Clear headline.",
    aiEnabled: true,
    ...over,
  };
}

describe("exportación JSON", () => {
  it("produce JSON válido con el AuditResult intacto", () => {
    const parsed = JSON.parse(toJson(audit(), "https://example.test/")) as ExportEnvelope;
    expect(parsed.format).toBe("ux-auditor-report@1");
    expect(parsed.url).toBe("https://example.test/");
    expect(parsed.audit.overallScore).toBe(62);
    expect(parsed.audit.findings[0].id).toBe("a11y-h1");
  });

  it("incluye una versión de formato para consumidores externos", () => {
    // Sin esto, un cambio de esquema rompería silenciosamente a quien lo consuma.
    const parsed = JSON.parse(toJson(audit(), "https://example.test/")) as ExportEnvelope;
    expect(parsed.format).toMatch(/@\d+$/);
    expect(Date.parse(parsed.generatedAt)).not.toBeNaN();
  });

  it("conserva la evidencia, que es lo que hace verificable el informe", () => {
    const parsed = JSON.parse(toJson(audit(), "https://example.test/")) as ExportEnvelope;
    expect(parsed.audit.findings[0].evidence).toEqual([{ selector: "h1", detail: "0 found" }]);
  });
});

describe("exportación Markdown", () => {
  it("incluye título, score y comprobaciones", () => {
    const md = toMarkdown(audit(), "https://example.test/");
    expect(md).toContain("# UX Audit — https://example.test/");
    expect(md).toContain("**Score: 62/100**");
    expect(md).toContain("11/16 checks passed");
  });

  it("omite las categorías no evaluadas", () => {
    const md = toMarkdown(audit(), "https://example.test/");
    expect(md).toContain("| Accessibility | 60 |");
    expect(md).not.toContain("| UX clarity |");
  });

  it("agrupa los hallazgos por severidad", () => {
    const md = toMarkdown(
      audit({ findings: [finding(), finding({ id: "clarity-favicon", severity: "low", title: "No favicon" })] }),
      "https://example.test/"
    );
    expect(md).toContain("### high (1)");
    expect(md).toContain("### low (1)");
  });

  it("incluye evidencia y corrección de cada hallazgo", () => {
    const md = toMarkdown(audit(), "https://example.test/");
    expect(md).toContain("**Evidence**");
    expect(md).toContain("`h1`");
    expect(md).toContain("**Fix:** Add exactly one H1.");
  });

  it("marca los hallazgos de IA como tales", () => {
    const md = toMarkdown(
      audit({ findings: [finding({ source: "ai", id: "ai-insight-1", title: "Vague headline" })] }),
      "https://example.test/"
    );
    expect(md).toContain("AI insight");
  });

  it("avisa de baja confianza", () => {
    const md = toMarkdown(audit({ confidence: "low", confidenceReason: "thin_content" }), "https://x.test/");
    expect(md).toContain("Low confidence");
  });

  it("avisa cuando no hubo renderizado", () => {
    const md = toMarkdown(audit({ rendered: false }), "https://x.test/");
    expect(md).toContain("Markup-only audit");
  });

  it("declara que la IA no afecta al score", () => {
    expect(toMarkdown(audit(), "https://x.test/")).toContain("never affect the score");
    expect(toMarkdown(audit({ aiEnabled: false }), "https://x.test/")).toContain("Deterministic audit");
  });

  it("escapa las barras verticales para no romper las tablas", () => {
    const md = toMarkdown(
      audit({ findings: [finding({ title: "Broken | pipe", fix: "Use a|b" })] }),
      "https://x.test/"
    );
    expect(md).toContain("Broken \\| pipe");
  });

  it("una sección de quick wins aparece sólo si los hay", () => {
    const withWins = toMarkdown(audit({ findings: [finding({ impact: "high", effort: "low" })] }), "https://x.test/");
    expect(withWins).toContain("## Start here");

    const without = toMarkdown(audit({ findings: [finding({ impact: "low", effort: "high" })] }), "https://x.test/");
    expect(without).not.toContain("## Start here");
  });
});

describe("nombre de fichero", () => {
  it("deriva del host y la fecha", () => {
    expect(exportFilename("https://www.example.com/path", "json")).toMatch(
      /^ux-audit-example\.com-\d{4}-\d{2}-\d{2}\.json$/
    );
  });

  it("no produce nombres peligrosos con una URL rara", () => {
    const name = exportFilename("https://a/../../etc/passwd", "md");
    expect(name).not.toContain("/");
    expect(name).not.toContain("..");
  });

  it("tolera una URL malformada", () => {
    expect(() => exportFilename("no-es-una-url", "json")).not.toThrow();
    expect(exportFilename("no-es-una-url", "json")).toContain("audit");
  });
});
