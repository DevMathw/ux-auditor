import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { buildPrompt } from "@/app/lib/buildPrompt";
import { fetchPageHTML } from "@/app/lib/fetchPage";
import { INSIGHT_JSON_SCHEMA, normalizeInsights } from "@/app/lib/auditSchema";
import { auditCacheKey, getCachedAudit, setCachedAudit } from "@/app/lib/auditCache";
import { buildRuleContext, runRules, type RuleReport } from "@/app/lib/rules";
import { renderPage, renderingAvailable, type VisualSnapshot } from "@/app/lib/render";
import { clientKey, rateLimit } from "@/app/lib/rateLimit";
import { parseChecks, parseLanguage, parseTargetUrl } from "@/app/lib/validation";
import type { AuditFinding, AuditResult } from "@/app/lib/types";

export const maxDuration = 60;

const MODEL = "claude-sonnet-5";
/**
 * La capa de IA solo escribe 3 campos cortos y 3 observaciones acotadas, así que
 * ya no necesita el presupuesto que requería generar el informe entero.
 */
const MAX_TOKENS = 2500;
const MODEL_TIMEOUT_MS = 30_000;

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 5 * 60_000;
const MAX_BODY_BYTES = 8_000;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function fail(code: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: code, ...extra }, { status });
}

/** Convierte los hallazgos del motor de reglas al formato del informe. */
function ruleFindingsToAudit(report: RuleReport, language: "en" | "es"): AuditFinding[] {
  return report.findings.map((f) => ({
    id: f.ruleId,
    category: f.category,
    severity: f.severity,
    impact: f.impact,
    effort: f.effort,
    title: f.title[language],
    description: f.description[language],
    fix: f.fix[language],
    evidence: f.evidence,
    wcag: f.wcag,
    source: "rule" as const,
  }));
}

export async function POST(req: NextRequest) {
  const limit = rateLimit(clientKey(req), RATE_LIMIT, RATE_WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "rate_limited", retryAfter: limit.retryAfter },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  const contentLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return fail("payload_too_large", 413);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("invalid_body", 400);
  }

  const input = (body ?? {}) as Record<string, unknown>;
  const parsed = parseTargetUrl(input.url);
  if (!parsed.ok) {
    return fail(parsed.error === "protocol" ? "invalid_protocol" : "invalid_url", 400);
  }

  const checks = parseChecks(input.checks);
  const language = parseLanguage(input.language);
  // La capa de IA es opcional: sin ella la auditoría sigue siendo completa y no
  // cuesta nada. Es lo que hace viable un plan gratuito.
  const useAI = input.ai !== false && Boolean(process.env.ANTHROPIC_API_KEY);
  // El renderizado es la tercera capa opcional: sin navegador la auditoría
  // sigue siendo válida, solo pierde las 5 reglas visuales.
  const wantVisual = input.visual !== false && renderingAvailable();

  const page = await fetchPageHTML(parsed.url);
  if (!page.ok) {
    return fail(`fetch_${page.reason}`, page.reason === "blocked" ? 400 : 422);
  }

  // Renderizar cuesta segundos, así que se hace una sola vez y su resultado
  // entra en la clave de caché: un informe con reglas visuales no es el mismo
  // informe que uno sin ellas.
  let visual: VisualSnapshot | null = null;
  if (wantVisual) {
    visual = await renderPage(page.finalUrl);
  }

  const cacheKey = auditCacheKey(page.html, checks, language, useAI, visual !== null);
  const cached = getCachedAudit(cacheKey);
  if (cached) {
    return NextResponse.json({ audit: cached, analyzedUrl: page.finalUrl, cached: true });
  }

  // ── Capa determinista ─────────────────────────────────────────────────────
  const report = runRules(page.html, parsed.url, checks, visual ?? undefined);

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
    findings: ruleFindingsToAudit(report, language),
    summary: "",
    quickWins: "",
    strengths: "",
    aiEnabled: false,
  };

  // ── Capa de interpretación (opcional) ─────────────────────────────────────
  if (useAI) {
    try {
      const ctx = buildRuleContext(page.html, parsed.url, visual ?? undefined);
      const screenshot = visual?.screenshot ?? null;
      const meta = {
        title: ctx.root.querySelector("title")?.text?.trim() ?? "",
        metaDescription:
          ctx.root.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() ?? "",
        headings: ctx.root
          .querySelectorAll("h1, h2, h3")
          .map((h) => h.text.trim())
          .filter(Boolean),
        aboveFoldText: visual?.aboveFoldText,
        hasScreenshot: screenshot !== null,
      };

      const prompt = buildPrompt(report, page.finalUrl, ctx.visibleText, meta, language);

      // Con captura el modelo VE el diseño: jerarquía, densidad, qué domina la
      // primera pantalla. Es lo que ninguna herramienta gratuita puede hacer.
      const content: Anthropic.ContentBlockParam[] = screenshot
        ? [
            {
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: screenshot },
            },
            { type: "text", text: prompt },
          ]
        : [{ type: "text", text: prompt }];

      const message = await anthropic.messages.create(
        {
          model: MODEL,
          max_tokens: MAX_TOKENS,
          output_config: { format: { type: "json_schema", schema: INSIGHT_JSON_SCHEMA } },
          messages: [{ role: "user", content }],
        },
        { timeout: MODEL_TIMEOUT_MS }
      );

      const rawText = message.content
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("");
      const insights = normalizeInsights(JSON.parse(rawText));

      if (insights) {
        audit.summary = insights.summary;
        audit.quickWins = insights.quickWins;
        audit.strengths = insights.strengths;
        audit.findings = [...audit.findings, ...insights.findings];
        audit.aiEnabled = true;
      }
    } catch (err) {
      // La capa de IA es un extra. Si falla, se entrega la auditoría
      // determinista completa en vez de perder también lo que sí funcionó.
      console.error("[audit] capa de IA no disponible:", err);
    }
  }

  if (!audit.aiEnabled) {
    audit.summary = buildDeterministicSummary(audit, language);
  }

  setCachedAudit(cacheKey, audit);
  return NextResponse.json({ audit, analyzedUrl: page.finalUrl, cached: false });
}

/** Resumen sin IA, para que el informe determinista se sostenga por sí solo. */
function buildDeterministicSummary(audit: AuditResult, language: "en" | "es"): string {
  const critical = audit.findings.filter((f) => f.severity === "critical").length;
  const high = audit.findings.filter((f) => f.severity === "high").length;

  if (language === "es") {
    const base = `La página supera ${audit.checksPassed} de ${audit.checksApplicable} comprobaciones automáticas aplicables.`;
    if (critical + high === 0) return `${base} No se han detectado problemas graves.`;
    return `${base} Hay ${critical} problema${critical === 1 ? "" : "s"} crítico${critical === 1 ? "" : "s"} y ${high} de prioridad alta que conviene atender primero.`;
  }
  const base = `This page passes ${audit.checksPassed} of ${audit.checksApplicable} applicable automated checks.`;
  if (critical + high === 0) return `${base} No serious issues were detected.`;
  return `${base} There ${critical + high === 1 ? "is" : "are"} ${critical} critical and ${high} high-priority issue${high === 1 ? "" : "s"} to address first.`;
}
