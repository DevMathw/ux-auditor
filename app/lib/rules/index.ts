import { parse } from "node-html-parser";
import type { AuditChecks } from "../types";
import { accessibilityRules } from "./accessibility";
import { hierarchyRules } from "./hierarchy";
import { clarityRules } from "./clarity";
import { visualRules } from "./visual";
import type { Rule, RuleCategory, RuleContext, RuleFinding, Severity } from "./types";

export * from "./types";

export const ALL_RULES: Rule[] = [
  ...accessibilityRules,
  ...hierarchyRules,
  ...clarityRules,
  ...visualRules,
];

const CATEGORY_OF_CHECK: Record<keyof AuditChecks, RuleCategory> = {
  accessibility: "accessibility",
  visualHierarchy: "hierarchy",
  uxClarity: "clarity",
};

export interface CategoryScore {
  category: RuleCategory;
  score: number;
  /** Reglas que aplicaban a esta página (las no aplicables se excluyen). */
  rulesApplicable: number;
  rulesPassed: number;
}

/**
 * Si solo vimos el esqueleto servido de una página que se pinta en cliente,
 * el informe habla de algo que el visitante nunca ve. Decirlo es obligatorio:
 * una puntuación alta sobre una página que no pudimos leer es peor que no dar
 * ninguna.
 */
export type Confidence = "high" | "low";

export interface RuleReport {
  confidence: Confidence;
  /** Motivo cuando la confianza es baja, ya localizado por el cliente. */
  confidenceReason: "thin_content" | null;
  findings: RuleFinding[];
  scores: Record<RuleCategory, CategoryScore | null>;
  overallScore: number;
  /** Reglas aplicables en total, para decir "12 de 17 comprobaciones superadas". */
  totalApplicable: number;
  totalPassed: number;
}

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Construye el contexto una sola vez y lo comparte entre todas las reglas. */
/** Bajo este umbral asumimos que no hemos visto la página real. */
const THIN_CONTENT_WORDS = 60;

export function buildRuleContext(
  html: string,
  url: URL,
  visual?: import("../render").VisualSnapshot
): RuleContext {
  const root = parse(html);

  // El texto de script/style no es contenido visible. Se clona el body para no
  // mutar el árbol que las reglas van a inspeccionar.
  const bodyClone = parse(root.querySelector("body")?.innerHTML ?? html);
  bodyClone.querySelectorAll("script, style, noscript, template").forEach((el) => el.remove());
  const visibleText = bodyClone.text.replace(/\s+/g, " ").trim();

  return { root, html, url, visibleText, visual };
}

/**
 * Ejecuta las reglas de las categorías solicitadas. El resultado es puramente
 * determinista: mismo HTML, mismo informe, siempre.
 */
export function runRules(
  html: string,
  url: URL,
  checks: AuditChecks,
  visual?: import("../render").VisualSnapshot
): RuleReport {
  const ctx = buildRuleContext(html, url, visual);

  const activeCategories = new Set<RuleCategory>(
    (Object.keys(CATEGORY_OF_CHECK) as (keyof AuditChecks)[])
      .filter((key) => checks[key])
      .map((key) => CATEGORY_OF_CHECK[key])
  );

  const findings: RuleFinding[] = [];
  const perCategory = new Map<
    RuleCategory,
    { penalty: number; maxPenalty: number; applicable: number; passed: number }
  >();

  for (const rule of ALL_RULES) {
    if (!activeCategories.has(rule.category)) continue;

    let applicable = true;
    try {
      applicable = rule.applies ? rule.applies(ctx) : true;
    } catch {
      applicable = false;
    }
    // Una regla que no aplica no suma al denominador: si la página no tiene
    // formularios, no merece nota por "sus formularios están etiquetados".
    if (!applicable) continue;

    const bucket =
      perCategory.get(rule.category) ?? { penalty: 0, maxPenalty: 0, applicable: 0, passed: 0 };
    bucket.applicable += 1;
    bucket.maxPenalty += rule.maxPenalty;

    let result: RuleFinding | null = null;
    try {
      result = rule.evaluate(ctx);
    } catch {
      // Una regla que revienta no puede tumbar la auditoría entera. Se descuenta
      // del denominador para no penalizar al usuario por un bug nuestro.
      bucket.applicable -= 1;
      bucket.maxPenalty -= rule.maxPenalty;
      perCategory.set(rule.category, bucket);
      continue;
    }

    if (result) {
      findings.push(result);
      bucket.penalty += result.penalty;
    } else {
      bucket.passed += 1;
    }
    perCategory.set(rule.category, bucket);
  }

  const scores: Record<RuleCategory, CategoryScore | null> = {
    accessibility: null,
    hierarchy: null,
    clarity: null,
  };

  for (const [category, bucket] of perCategory) {
    // Normalizado sobre lo que de verdad se podía perder en esta página.
    const ratio = bucket.maxPenalty > 0 ? bucket.penalty / bucket.maxPenalty : 0;
    scores[category] = {
      category,
      score: Math.max(0, Math.min(100, Math.round(100 * (1 - ratio)))),
      rulesApplicable: bucket.applicable,
      rulesPassed: bucket.passed,
    };
  }

  const active = Object.values(scores).filter((s): s is CategoryScore => s !== null);
  const overallScore =
    active.length === 0
      ? 0
      : Math.round(active.reduce((sum, s) => sum + s.score, 0) / active.length);

  findings.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.penalty - a.penalty
  );

  // Con renderizado vemos la página real, así que el contenido escaso ya no es
  // una limitación nuestra sino un hecho sobre la página.
  const words = ctx.visibleText.split(/\s+/).filter(Boolean).length;
  const thin = !visual && words < THIN_CONTENT_WORDS;

  return {
    confidence: thin ? "low" : "high",
    confidenceReason: thin ? "thin_content" : null,
    findings,
    scores,
    overallScore,
    totalApplicable: active.reduce((n, s) => n + s.rulesApplicable, 0),
    totalPassed: active.reduce((n, s) => n + s.rulesPassed, 0),
  };
}
