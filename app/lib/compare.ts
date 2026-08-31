import type { AuditFinding, AuditResult, HistoryEntry } from "./types";

/**
 * Comparación entre dos auditorías.
 *
 * Sólo tiene sentido porque la puntuación es determinista: si el score lo
 * decidiera un modelo, una diferencia de 5 puntos no distinguiría una mejora
 * real del ruido. Aquí un cambio significa que cambió la página.
 *
 * La IA no participa: se comparan hallazgos por su ruleId, y los hallazgos de
 * IA quedan fuera precisamente porque no son reproducibles entre ejecuciones.
 */

export type FindingChange = "fixed" | "new" | "unchanged";

export interface ComparedFinding {
  finding: AuditFinding;
  change: FindingChange;
}

export interface ScoreDelta {
  before: number | null;
  after: number | null;
  delta: number | null;
}

export interface AuditComparison {
  overall: ScoreDelta;
  categories: {
    accessibility: ScoreDelta;
    visualHierarchy: ScoreDelta;
    uxClarity: ScoreDelta;
  };
  checks: { before: string; after: string };
  fixed: AuditFinding[];
  introduced: AuditFinding[];
  unchanged: AuditFinding[];
  /** Cuántos hallazgos de IA se dejaron fuera, para poder decirlo en la UI. */
  aiFindingsExcluded: number;
  comparable: boolean;
  /** Motivo cuando la comparación no es del todo justa. */
  caveat: "different_coverage" | null;
}

function delta(before: number | null, after: number | null): ScoreDelta {
  return {
    before,
    after,
    delta: before !== null && after !== null ? after - before : null,
  };
}

/** Sólo los hallazgos de reglas son comparables entre ejecuciones. */
function ruleFindings(audit: AuditResult): AuditFinding[] {
  return audit.findings.filter((f) => f.source === "rule");
}

export function compareAudits(before: AuditResult, after: AuditResult): AuditComparison {
  const beforeRules = ruleFindings(before);
  const afterRules = ruleFindings(after);

  const beforeIds = new Set(beforeRules.map((f) => f.id));
  const afterIds = new Set(afterRules.map((f) => f.id));

  // Un hallazgo "arreglado" es una regla que fallaba antes y ya no falla.
  const fixed = beforeRules.filter((f) => !afterIds.has(f.id));
  const introduced = afterRules.filter((f) => !beforeIds.has(f.id));
  const unchanged = afterRules.filter((f) => beforeIds.has(f.id));

  // Si una auditoría corrió con renderizado y la otra no, evaluaron distinto
  // número de reglas y el delta no es limpio. Se compara igual, pero se avisa.
  const differentCoverage = before.checksApplicable !== after.checksApplicable;

  return {
    overall: delta(before.overallScore, after.overallScore),
    categories: {
      accessibility: delta(
        before.scoreBreakdown.accessibility?.score ?? null,
        after.scoreBreakdown.accessibility?.score ?? null
      ),
      visualHierarchy: delta(
        before.scoreBreakdown.visualHierarchy?.score ?? null,
        after.scoreBreakdown.visualHierarchy?.score ?? null
      ),
      uxClarity: delta(
        before.scoreBreakdown.uxClarity?.score ?? null,
        after.scoreBreakdown.uxClarity?.score ?? null
      ),
    },
    checks: {
      before: `${before.checksPassed}/${before.checksApplicable}`,
      after: `${after.checksPassed}/${after.checksApplicable}`,
    },
    fixed,
    introduced,
    unchanged,
    aiFindingsExcluded:
      before.findings.length - beforeRules.length + (after.findings.length - afterRules.length),
    comparable: true,
    caveat: differentCoverage ? "different_coverage" : null,
  };
}

/** Entradas del historial que pueden compararse: misma URL, dos o más veces. */
export function comparableGroups(history: HistoryEntry[]): Map<string, HistoryEntry[]> {
  const byUrl = new Map<string, HistoryEntry[]>();
  for (const entry of history) {
    const list = byUrl.get(entry.url) ?? [];
    list.push(entry);
    byUrl.set(entry.url, list);
  }
  for (const [url, list] of byUrl) {
    if (list.length < 2) byUrl.delete(url);
    // Más antigua primero, para que "antes → después" siga el tiempo real.
    else list.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  }
  return byUrl;
}
