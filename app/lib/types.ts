import type { Effort, Evidence, Impact, RuleCategory, Severity } from "./rules/types";

export type { Effort, Evidence, Impact, RuleCategory, Severity };

export interface AuditChecks {
  accessibility: boolean;
  visualHierarchy: boolean;
  uxClarity: boolean;
}

/** De dónde sale un hallazgo: una regla verificable o la capa de interpretación. */
export type FindingSource = "rule" | "ai";

export interface AuditFinding {
  id: string;
  category: RuleCategory;
  severity: Severity;
  impact: Impact;
  effort: Effort;
  title: string;
  description: string;
  /** Corrección concreta. */
  fix: string;
  /** Prueba verificable. Vacío solo en hallazgos de IA sin cita textual. */
  evidence: Evidence[];
  wcag?: string;
  source: FindingSource;
}

export interface AuditScore {
  score: number;
  rulesApplicable: number;
  rulesPassed: number;
}

export interface AuditResult {
  /** Versión del formato: permite descartar historial incompatible. */
  version: 2;
  overallScore: number;
  scoreBreakdown: {
    accessibility: AuditScore | null;
    visualHierarchy: AuditScore | null;
    uxClarity: AuditScore | null;
  };
  checksPassed: number;
  checksApplicable: number;
  /** "low" cuando solo pudimos ver el esqueleto servido de la página. */
  confidence: "high" | "low";
  confidenceReason: "thin_content" | null;
  /** true si la página se renderizó y corrieron las reglas visuales. */
  rendered: boolean;
  findings: AuditFinding[];
  summary: string;
  quickWins: string;
  strengths: string;
  /** false cuando la auditoría es puramente determinista (sin capa de IA). */
  aiEnabled: boolean;
}

export interface AuditRequest {
  url: string;
  checks: AuditChecks;
  language: "en" | "es";
}

export interface HistoryEntry {
  id: string;
  url: string;
  score: number;
  date: string;
  /** Idioma en el que se generó el informe, para no mezclarlo al recargarlo. */
  language: "en" | "es";
  audit: AuditResult;
}

/** Un hallazgo de alto impacto y bajo esfuerzo: lo que hay que hacer primero. */
export function isQuickWin(f: AuditFinding): boolean {
  return f.impact === "high" && f.effort === "low";
}
