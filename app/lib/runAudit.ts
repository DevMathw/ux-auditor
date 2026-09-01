import Anthropic from "@anthropic-ai/sdk";
import { buildPrompt } from "./buildPrompt";
import { fetchPageHTML } from "./fetchPage";
import { INSIGHT_JSON_SCHEMA, normalizeInsights } from "./auditSchema";
import { auditCacheKey, getCachedAudit, setCachedAudit } from "./auditCache";
import { log, safeHost } from "./log";
import { recordAudit } from "./usage";
import { renderPage, renderingAvailable } from "./render";
import { buildRuleContext, runRules, type RuleReport } from "./rules";
import type { VisualSnapshot } from "./render";
import type { AuditChecks, AuditFinding, AuditResult } from "./types";

/**
 * El caso de uso completo, sin saber nada de HTTP.
 *
 * Vive fuera del route handler para que se pueda probar dando entradas y
 * observando salidas, en vez de teniendo que fabricar un NextRequest. La ruta
 * queda reducida a lo suyo: validar, traducir errores a códigos de estado y
 * serializar.
 */

const MODEL = "claude-sonnet-5";
/** La capa de IA sólo escribe 3 campos cortos y 3 observaciones acotadas. */
const MAX_TOKENS = 2500;
const MODEL_TIMEOUT_MS = 30_000;

export type AuditFailure =
  | "fetch_blocked"
  | "fetch_unreachable"
  | "fetch_not_html"
  | "fetch_too_large";

export type AuditOutcome =
  | { ok: true; audit: AuditResult; analyzedUrl: string; cached: boolean }
  | { ok: false; reason: AuditFailure };

export interface AuditOptions {
  url: URL;
  checks: AuditChecks;
  language: "en" | "es";
  /** Permite desactivar la capa de IA (plan gratuito, o tests). */
  ai?: boolean;
  /** Permite desactivar el renderizado (tests, o entornos sin navegador). */
  visual?: boolean;
}

/**
 * Las dependencias externas se inyectan para poder sustituirlas en los tests
 * sin mockear módulos enteros. En producción se usan las reales.
 */
export interface AuditDeps {
  fetchPage: typeof fetchPageHTML;
  render: typeof renderPage;
  renderAvailable: typeof renderingAvailable;
  createMessage: (
    params: Anthropic.MessageCreateParamsNonStreaming,
    options: { timeout: number }
  ) => Promise<Anthropic.Message>;
  hasApiKey: () => boolean;
}

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export const defaultDeps: AuditDeps = {
  fetchPage: fetchPageHTML,
  render: renderPage,
  renderAvailable: renderingAvailable,
  createMessage: (params, options) => anthropic().messages.create(params, options),
  hasApiKey: () => Boolean(process.env.ANTHROPIC_API_KEY),
};

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

/** Resumen sin IA, para que el informe determinista se sostenga por sí solo. */
export function buildDeterministicSummary(
  audit: AuditResult,
  language: "en" | "es"
): string {
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

/**
 * Añade la capa de interpretación sobre un informe ya construido.
 * Nunca lanza: si la IA falla, el informe determinista sigue siendo válido.
 */
async function applyInsightLayer(
  audit: AuditResult,
  report: RuleReport,
  html: string,
  url: URL,
  finalUrl: string,
  visual: VisualSnapshot | null,
  language: "en" | "es",
  deps: AuditDeps
): Promise<void> {
  try {
    const ctx = buildRuleContext(html, url, visual ?? undefined);
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

    const prompt = buildPrompt(report, finalUrl, ctx.visibleText, meta, language);

    // Con captura el modelo VE el diseño: jerarquía, densidad, qué domina la
    // primera pantalla. Es lo que ninguna herramienta gratuita puede hacer.
    const content: Anthropic.ContentBlockParam[] = screenshot
      ? [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: screenshot } },
          { type: "text", text: prompt },
        ]
      : [{ type: "text", text: prompt }];

    const message = await deps.createMessage(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        output_config: { format: { type: "json_schema", schema: INSIGHT_JSON_SCHEMA } },
        messages: [{ role: "user", content }],
      },
      { timeout: MODEL_TIMEOUT_MS }
    );

    const rawText = message.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const insights = normalizeInsights(JSON.parse(rawText));
    if (!insights) return;

    audit.summary = insights.summary;
    audit.quickWins = insights.quickWins;
    audit.strengths = insights.strengths;
    audit.findings = [...audit.findings, ...insights.findings];
    audit.aiEnabled = true;

    recordAudit({
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      hadScreenshot: screenshot !== null,
    });
  } catch (err) {
    // La capa de IA es un extra. Si falla, se entrega la auditoría determinista
    // completa en vez de perder también lo que sí funcionó.
    log.error({ event: "ai_layer_failed", host: safeHost(finalUrl), error: err });
  }
}

export async function runAudit(
  options: AuditOptions,
  deps: AuditDeps = defaultDeps
): Promise<AuditOutcome> {
  const { url, checks, language } = options;

  const useAI = options.ai !== false && deps.hasApiKey();
  // El renderizado es la tercera capa opcional: sin navegador la auditoría
  // sigue siendo válida, sólo pierde las 5 reglas visuales.
  const wantVisual = options.visual !== false && (await deps.renderAvailable());

  const startedAt = Date.now();
  const page = await deps.fetchPage(url);
  if (!page.ok) {
    log.warn({ event: "fetch_failed", host: safeHost(url), reason: page.reason });
    return { ok: false, reason: `fetch_${page.reason}` as AuditFailure };
  }

  // Renderizar cuesta segundos, así que se hace una sola vez y su resultado
  // entra en la clave de caché: un informe con reglas visuales no es el mismo
  // informe que uno sin ellas.
  const visual = wantVisual ? await deps.render(page.finalUrl) : null;

  const cacheKey = auditCacheKey(page.html, checks, language, useAI, visual !== null);
  const cached = await getCachedAudit(cacheKey);
  if (cached) {
    log.info({
      event: "audit_cache_hit",
      host: safeHost(page.finalUrl),
      durationMs: Date.now() - startedAt,
    });
    return { ok: true, audit: cached, analyzedUrl: page.finalUrl, cached: true };
  }

  // ── Capa determinista ───────────────────────────────────────────────────
  const report = runRules(page.html, url, checks, visual ?? undefined);

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

  // ── Capa de interpretación (opcional) ───────────────────────────────────
  if (useAI) {
    await applyInsightLayer(audit, report, page.html, url, page.finalUrl, visual, language, deps);
  }

  if (!audit.aiEnabled) {
    audit.summary = buildDeterministicSummary(audit, language);
    recordAudit({ inputTokens: 0, outputTokens: 0, hadScreenshot: false });
  }

  await setCachedAudit(cacheKey, audit);
  log.info({
    event: "audit_completed",
    host: safeHost(page.finalUrl),
    durationMs: Date.now() - startedAt,
    score: audit.overallScore,
    checks: `${audit.checksPassed}/${audit.checksApplicable}`,
    rendered: audit.rendered,
    aiEnabled: audit.aiEnabled,
    confidence: audit.confidence,
  });
  return { ok: true, audit, analyzedUrl: page.finalUrl, cached: false };
}
