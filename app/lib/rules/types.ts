import type { HTMLElement } from "node-html-parser";
import type { VisualSnapshot } from "../render";

export type RuleCategory = "accessibility" | "hierarchy" | "clarity";
export type Severity = "critical" | "high" | "medium" | "low";
/** Cuánto cuesta aplicar la corrección. Lo sabemos nosotros: no hace falta IA. */
export type Effort = "low" | "medium" | "high";
export type Impact = "high" | "medium" | "low";

/** Prueba verificable de por qué una regla falló. Sin esto es opinión, no auditoría. */
export interface Evidence {
  /** Dónde mirar en la página. */
  selector?: string;
  /** El HTML culpable, ya recortado. */
  snippet?: string;
  /** Cuántos elementos incumplen. */
  count?: number;
  /** Dato medido en crudo (p. ej. "3 de 47 imágenes"). */
  detail?: string;
}

/** Texto en los dos idiomas soportados. */
export interface Localized {
  en: string;
  es: string;
}

export interface RuleFinding {
  ruleId: string;
  category: RuleCategory;
  severity: Severity;
  title: Localized;
  description: Localized;
  /** Corrección concreta, escrita por nosotros — no generada. */
  fix: Localized;
  evidence: Evidence[];
  /** Puntos que resta al score de su categoría. */
  penalty: number;
  /** Referencia al criterio WCAG cuando aplica. */
  wcag?: string;
  effort: Effort;
  impact: Impact;
}

/** Todo lo que una regla necesita para evaluarse. */
export interface RuleContext {
  root: HTMLElement;
  html: string;
  url: URL;
  /** Texto visible, ya sin script/style. */
  visibleText: string;
  /**
   * Presente solo si se pudo renderizar la página. Las reglas visuales lo
   * exigen en su `applies`, así que sin él simplemente no se evalúan.
   */
  visual?: VisualSnapshot;
}

export interface Rule {
  id: string;
  category: RuleCategory;
  /** Peso máximo que puede restar. Las reglas escalan dentro de este techo. */
  maxPenalty: number;
  severity: Severity;
  /** Esfuerzo típico de la corrección que propone esta regla. */
  effort: Effort;
  wcag?: string;
  /**
   * Si la regla no es evaluable en esta página (no hay imágenes, no hay
   * formularios…), devuelve false. No cuenta ni como aprobada ni como suspensa:
   * de lo contrario una página trivial obtiene nota alta por lo que NO tiene.
   */
  applies?(ctx: RuleContext): boolean;
  /** Devuelve null si la página cumple la regla. */
  evaluate(ctx: RuleContext): RuleFinding | null;
}

/** Un elemento oculto para tecnología asistiva no existe a efectos de auditoría. */
export function isAriaHidden(el: HTMLElement): boolean {
  let node: HTMLElement | null = el;
  for (let depth = 0; node && depth < 12; depth++) {
    if (node.getAttribute?.("aria-hidden") === "true") return true;
    node = node.parentNode as HTMLElement | null;
  }
  return false;
}

/**
 * Nombre accesible aproximado. Cubre los casos que de verdad aparecen en la
 * web real: aria-label, title, texto, alt de imagen y — importante — iconos SVG
 * con aria-label o <title>, que es como etiquetan sus enlaces la mayoría de
 * sitios modernos.
 */
export function accessibleName(el: HTMLElement): string {
  const aria = el.getAttribute("aria-label");
  if (aria?.trim()) return aria.trim();
  if (el.getAttribute("aria-labelledby")?.trim()) return "(aria-labelledby)";

  const text = el.text?.trim();
  if (text) return text;

  const title = el.getAttribute("title");
  if (title?.trim()) return title.trim();

  const alt = el.querySelector("img")?.getAttribute("alt");
  if (alt?.trim()) return alt.trim();

  // SVG etiquetado: <svg aria-label="…"> o <svg><title>…</title></svg>
  const svg = el.querySelector("svg");
  if (svg) {
    const svgAria = svg.getAttribute("aria-label");
    if (svgAria?.trim()) return svgAria.trim();
    const svgTitle = svg.querySelector("title")?.text?.trim();
    if (svgTitle) return svgTitle;
  }

  // Cualquier descendiente etiquetado sirve de nombre.
  const labelled = el.querySelector("[aria-label]")?.getAttribute("aria-label");
  if (labelled?.trim()) return labelled.trim();

  return "";
}

/** Recorta un elemento a un fragmento legible para mostrar como evidencia. */
export function snippet(el: HTMLElement, max = 120): string {
  const raw = el.toString().replace(/\s+/g, " ").trim();
  return raw.length > max ? raw.slice(0, max) + "…" : raw;
}

/** Describe un elemento por tag + atributos identificativos. */
export function describe(el: HTMLElement): string {
  const tag = el.rawTagName ?? "?";
  const id = el.getAttribute("id");
  const cls = el.getAttribute("class");
  if (id) return `${tag}#${id}`;
  if (cls) return `${tag}.${cls.trim().split(/\s+/).slice(0, 2).join(".")}`;
  return tag;
}

/** El impacto se deriva de la severidad: una sola fuente de verdad. */
const IMPACT_OF_SEVERITY: Record<Severity, Impact> = {
  critical: "high",
  high: "high",
  medium: "medium",
  low: "low",
};

/**
 * Constructor de hallazgos: mantiene la forma consistente en las 20+ reglas y
 * evita repetir el objeto entero en cada una.
 */
export function finding(
  rule: Rule,
  parts: {
    title: Localized;
    description: Localized;
    fix: Localized;
    evidence: Evidence[];
    /** Fracción de maxPenalty a aplicar (0-1). Por defecto 1. */
    ratio?: number;
  }
): RuleFinding {
  const ratio = Math.min(1, Math.max(0, parts.ratio ?? 1));
  return {
    ruleId: rule.id,
    category: rule.category,
    severity: rule.severity,
    effort: rule.effort,
    impact: IMPACT_OF_SEVERITY[rule.severity],
    title: parts.title,
    description: parts.description,
    fix: parts.fix,
    evidence: parts.evidence,
    penalty: Math.round(rule.maxPenalty * ratio * 10) / 10,
    wcag: rule.wcag,
  };
}
