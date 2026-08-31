/**
 * Audita esta propia aplicación y guarda el resultado.
 *
 * Por qué un script y no una auditoría en vivo desde la portada: el guard SSRF
 * bloquea 127.0.0.1 a propósito, así que la app no puede auditarse a sí misma
 * a través de su propia API sin abrir un agujero. Y hacerlo en cada visita
 * costaría una llamada al modelo por visitante.
 *
 * Este script usa el motor directamente contra el build de producción local, y
 * escribe un resultado real con su fecha. La portada lo muestra etiquetado como
 * generado por este script, nunca como una auditoría en vivo.
 *
 * Uso:
 *   npm run build && npx next start -p 3210 &
 *   npm run self-audit
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { buildRuleContext, runRules } from "../app/lib/rules";
import { renderPage } from "../app/lib/render";
import { buildPrompt } from "../app/lib/buildPrompt";
import { INSIGHT_JSON_SCHEMA, normalizeInsights } from "../app/lib/auditSchema";
import type { AuditFinding, AuditResult } from "../app/lib/types";
import type { RuleReport } from "../app/lib/rules";

const TARGET = process.env.SELF_AUDIT_URL ?? "http://127.0.0.1:3210/";
const OUTPUT = resolve(import.meta.dirname, "../app/lib/self-audit.json");
const CHECKS = { accessibility: true, visualHierarchy: true, uxClarity: true };

function toFindings(report: RuleReport): AuditFinding[] {
  return report.findings.map((f) => ({
    id: f.ruleId,
    category: f.category,
    severity: f.severity,
    impact: f.impact,
    effort: f.effort,
    title: f.title.en,
    description: f.description.en,
    fix: f.fix.en,
    evidence: f.evidence,
    wcag: f.wcag,
    source: "rule" as const,
  }));
}

async function main() {
  console.log(`Auditando ${TARGET}`);

  const response = await fetch(TARGET, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; UXAuditor/1.0)" },
  });
  if (!response.ok) throw new Error(`El objetivo devolvió ${response.status}`);
  const html = await response.text();

  const url = new URL(TARGET);
  const visual = await renderPage(TARGET);
  console.log(visual ? "  renderizado: sí" : "  renderizado: no disponible");

  const report = runRules(html, url, CHECKS, visual ?? undefined);
  console.log(`  score ${report.overallScore} · ${report.totalPassed}/${report.totalApplicable}`);

  const audit: AuditResult = {
    version: 2,
    overallScore: report.overallScore,
    scoreBreakdown: {
      accessibility: report.scores.accessibility,
      visualHierarchy: report.scores.hierarchy,
      uxClarity: report.scores.clarity,
    },
    checksPassed: report.totalPassed,
    checksApplicable: report.totalApplicable,
    confidence: report.confidence,
    confidenceReason: report.confidenceReason,
    rendered: visual !== null,
    findings: toFindings(report),
    summary: "",
    quickWins: "",
    strengths: "",
    aiEnabled: false,
  };

  if (process.env.ANTHROPIC_API_KEY) {
    const ctx = buildRuleContext(html, url, visual ?? undefined);
    const meta = {
      title: ctx.root.querySelector("title")?.text?.trim() ?? "",
      metaDescription:
        ctx.root.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() ?? "",
      headings: ctx.root.querySelectorAll("h1, h2, h3").map((h) => h.text.trim()).filter(Boolean),
      aboveFoldText: visual?.aboveFoldText,
      hasScreenshot: Boolean(visual?.screenshot),
    };
    const prompt = buildPrompt(report, TARGET, ctx.visibleText, meta, "en");
    const content: Anthropic.ContentBlockParam[] = visual?.screenshot
      ? [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: visual.screenshot } },
          { type: "text", text: prompt },
        ]
      : [{ type: "text", text: prompt }];

    const message = await new Anthropic().messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2500,
      output_config: { format: { type: "json_schema", schema: INSIGHT_JSON_SCHEMA } },
      messages: [{ role: "user", content }],
    });

    const insights = normalizeInsights(
      JSON.parse(message.content.map((b) => (b.type === "text" ? b.text : "")).join(""))
    );
    if (insights) {
      audit.summary = insights.summary;
      audit.quickWins = insights.quickWins;
      audit.strengths = insights.strengths;
      audit.findings = [...audit.findings, ...insights.findings];
      audit.aiEnabled = true;
      console.log(`  capa de IA: ${insights.findings.length} observaciones`);
    }
  } else {
    console.log("  capa de IA: omitida (sin ANTHROPIC_API_KEY)");
  }

  const payload = {
    /** Deja constancia de que esto NO es una auditoría en vivo. */
    generatedBy: "scripts/self-audit.mts",
    generatedAt: new Date().toISOString(),
    target: TARGET,
    audit,
  };

  writeFileSync(OUTPUT, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`Escrito en ${OUTPUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
