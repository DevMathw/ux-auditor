import type { AuditFinding, Effort, Impact, RuleCategory, Severity } from "./types";

const CATEGORIES: RuleCategory[] = ["accessibility", "hierarchy", "clarity"];
const SEVERITIES: Severity[] = ["critical", "high", "medium", "low"];
const IMPACTS: Impact[] = ["high", "medium", "low"];
const EFFORTS: Effort[] = ["low", "medium", "high"];

/**
 * Schema de la capa de interpretación. Nota lo que NO está aquí: puntuaciones.
 * Las calcula el motor de reglas, así que el modelo no puede moverlas.
 */
export const INSIGHT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "strengths", "quickWins", "insights"],
  properties: {
    summary: { type: "string", description: "Dos frases sobre qué intenta hacer la página y si lo logra." },
    strengths: { type: "string", description: "Una o dos frases sobre lo que funciona de verdad." },
    quickWins: { type: "string", description: "Una o dos frases sobre los cambios de mejor relación esfuerzo/resultado." },
    insights: {
      type: "array",
      description: "De 2 a 4 observaciones que solo un lector humano podría hacer.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "description", "fix", "quote", "category", "severity", "effort"],
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          fix: { type: "string", description: "Cambio concreto y accionable." },
          quote: {
            type: "string",
            description: "Cita literal del texto visible de la página que respalda la observación.",
          },
          category: { type: "string", enum: CATEGORIES },
          severity: { type: "string", enum: SEVERITIES },
          effort: { type: "string", enum: EFFORTS },
        },
      },
    },
  },
} as const;

const IMPACT_OF_SEVERITY: Record<Severity, Impact> = {
  critical: "high",
  high: "high",
  medium: "medium",
  low: "low",
};

function str(value: unknown, max = 2000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function oneOf<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export interface InsightLayer {
  summary: string;
  strengths: string;
  quickWins: string;
  findings: AuditFinding[];
}

/**
 * Normaliza la salida del modelo. Descarta observaciones sin cita: la cita es
 * lo que hace verificable un hallazgo de IA, y sin ella no entra al informe.
 */
export function normalizeInsights(raw: unknown): InsightLayer | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Record<string, unknown>;

  const rawInsights = Array.isArray(input.insights) ? input.insights : [];
  const findings: AuditFinding[] = [];

  rawInsights.forEach((item, index) => {
    const i = (item ?? {}) as Record<string, unknown>;
    const title = str(i.title, 160);
    const quote = str(i.quote, 300);
    // Sin cita no hay evidencia, y sin evidencia no es una auditoría.
    if (!title || !quote) return;

    const severity = oneOf(i.severity, SEVERITIES, "medium");
    findings.push({
      id: `ai-insight-${index + 1}`,
      category: oneOf(i.category, CATEGORIES, "clarity"),
      severity,
      impact: IMPACT_OF_SEVERITY[severity],
      effort: oneOf(i.effort, EFFORTS, "medium"),
      title,
      description: str(i.description, 800),
      fix: str(i.fix, 600),
      evidence: [{ detail: "Texto citado de la página", snippet: quote }],
      source: "ai",
    });
  });

  return {
    summary: str(input.summary, 800),
    strengths: str(input.strengths, 600),
    quickWins: str(input.quickWins, 600),
    findings,
  };
}

/** Valida un informe recuperado de localStorage. Descarta formatos antiguos. */
export function normalizeAudit(raw: unknown): import("./types").AuditResult | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Record<string, unknown>;
  if (input.version !== 2) return null;
  if (!Array.isArray(input.findings)) return null;

  const findings = input.findings
    .map((item): AuditFinding | null => {
      const f = (item ?? {}) as Record<string, unknown>;
      const title = str(f.title, 200);
      if (!title) return null;
      const severity = oneOf(f.severity, SEVERITIES, "medium");
      return {
        id: str(f.id, 80) || "unknown",
        category: oneOf(f.category, CATEGORIES, "clarity"),
        severity,
        impact: oneOf(f.impact, IMPACTS, IMPACT_OF_SEVERITY[severity]),
        effort: oneOf(f.effort, EFFORTS, "medium"),
        title,
        description: str(f.description, 1000),
        fix: str(f.fix, 800),
        evidence: Array.isArray(f.evidence) ? (f.evidence as AuditFinding["evidence"]).slice(0, 6) : [],
        wcag: typeof f.wcag === "string" ? f.wcag : undefined,
        source: f.source === "ai" ? "ai" : "rule",
      };
    })
    .filter((f): f is AuditFinding => f !== null);

  const breakdown = (input.scoreBreakdown ?? {}) as Record<string, unknown>;
  const score = (v: unknown) => {
    if (!v || typeof v !== "object") return null;
    const s = v as Record<string, unknown>;
    const n = Number(s.score);
    if (!Number.isFinite(n)) return null;
    return {
      score: Math.min(100, Math.max(0, Math.round(n))),
      rulesApplicable: Number(s.rulesApplicable) || 0,
      rulesPassed: Number(s.rulesPassed) || 0,
    };
  };

  const overall = Number(input.overallScore);

  return {
    version: 2,
    overallScore: Number.isFinite(overall) ? Math.min(100, Math.max(0, Math.round(overall))) : 0,
    scoreBreakdown: {
      accessibility: score(breakdown.accessibility),
      visualHierarchy: score(breakdown.visualHierarchy),
      uxClarity: score(breakdown.uxClarity),
    },
    checksPassed: Number(input.checksPassed) || 0,
    checksApplicable: Number(input.checksApplicable) || 0,
    confidence: input.confidence === "low" ? "low" : "high",
    confidenceReason: input.confidenceReason === "thin_content" ? "thin_content" : null,
    rendered: input.rendered === true,
    findings,
    summary: str(input.summary, 800),
    quickWins: str(input.quickWins, 600),
    strengths: str(input.strengths, 600),
    aiEnabled: input.aiEnabled === true,
  };
}
