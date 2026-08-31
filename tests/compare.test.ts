import { describe, expect, it } from "vitest";
import { compareAudits, comparableGroups } from "@/app/lib/compare";
import type { AuditFinding, AuditResult, HistoryEntry } from "@/app/lib/types";

function finding(id: string, source: "rule" | "ai" = "rule"): AuditFinding {
  return {
    id,
    category: "accessibility",
    severity: "high",
    impact: "high",
    effort: "low",
    title: `Finding ${id}`,
    description: "",
    fix: "",
    evidence: [],
    source,
  };
}

function audit(over: Partial<AuditResult> = {}): AuditResult {
  return {
    version: 2,
    overallScore: 50,
    scoreBreakdown: {
      accessibility: { score: 50, rulesApplicable: 10, rulesPassed: 5 },
      visualHierarchy: { score: 50, rulesApplicable: 4, rulesPassed: 2 },
      uxClarity: { score: 50, rulesApplicable: 6, rulesPassed: 3 },
    },
    checksPassed: 10,
    checksApplicable: 20,
    confidence: "high",
    confidenceReason: null,
    rendered: false,
    findings: [],
    summary: "",
    quickWins: "",
    strengths: "",
    aiEnabled: false,
    ...over,
  };
}

function entry(url: string, date: string, score = 50): HistoryEntry {
  return { id: `${url}-${date}`, url, score, date, language: "en", audit: audit({ overallScore: score }) };
}

describe("deltas de puntuación", () => {
  it("calcula la diferencia global", () => {
    const c = compareAudits(audit({ overallScore: 50 }), audit({ overallScore: 72 }));
    expect(c.overall).toEqual({ before: 50, after: 72, delta: 22 });
  });

  it("una bajada produce un delta negativo", () => {
    expect(compareAudits(audit({ overallScore: 80 }), audit({ overallScore: 65 })).overall.delta).toBe(-15);
  });

  it("calcula el delta por categoría", () => {
    const before = audit();
    const after = audit({
      scoreBreakdown: {
        accessibility: { score: 90, rulesApplicable: 10, rulesPassed: 9 },
        visualHierarchy: { score: 50, rulesApplicable: 4, rulesPassed: 2 },
        uxClarity: { score: 30, rulesApplicable: 6, rulesPassed: 2 },
      },
    });
    const c = compareAudits(before, after);
    expect(c.categories.accessibility.delta).toBe(40);
    expect(c.categories.visualHierarchy.delta).toBe(0);
    expect(c.categories.uxClarity.delta).toBe(-20);
  });

  it("una categoría ausente en un lado da delta nulo, no cero", () => {
    // Cero significaría "no cambió"; null significa "no comparable".
    const before = audit();
    const after = audit({
      scoreBreakdown: { ...audit().scoreBreakdown, uxClarity: null },
    });
    expect(compareAudits(before, after).categories.uxClarity.delta).toBeNull();
  });
});

describe("cambios en los hallazgos", () => {
  it("clasifica arreglados, nuevos y sin cambios", () => {
    const before = audit({ findings: [finding("a"), finding("b"), finding("c")] });
    const after = audit({ findings: [finding("b"), finding("c"), finding("d")] });
    const c = compareAudits(before, after);

    expect(c.fixed.map((f) => f.id)).toEqual(["a"]);
    expect(c.introduced.map((f) => f.id)).toEqual(["d"]);
    expect(c.unchanged.map((f) => f.id).sort()).toEqual(["b", "c"]);
  });

  it("excluye los hallazgos de IA de la comparación", () => {
    // No son reproducibles entre ejecuciones: incluirlos produciría "arreglos"
    // y "regresiones" fantasma que no corresponden a ningún cambio real.
    const before = audit({ findings: [finding("a"), finding("ai-insight-1", "ai")] });
    const after = audit({ findings: [finding("a"), finding("ai-insight-2", "ai")] });
    const c = compareAudits(before, after);

    expect(c.fixed).toHaveLength(0);
    expect(c.introduced).toHaveLength(0);
    expect(c.unchanged.map((f) => f.id)).toEqual(["a"]);
    expect(c.aiFindingsExcluded).toBe(2);
  });

  it("arreglarlo todo deja la lista de nuevos vacía", () => {
    const c = compareAudits(audit({ findings: [finding("a"), finding("b")] }), audit({ findings: [] }));
    expect(c.fixed).toHaveLength(2);
    expect(c.introduced).toHaveLength(0);
    expect(c.unchanged).toHaveLength(0);
  });
});

describe("honestidad de la comparación", () => {
  it("avisa cuando las dos auditorías cubrieron distinto número de reglas", () => {
    // Una con renderizado y otra sin él evalúan distinto: el delta no es limpio.
    const c = compareAudits(audit({ checksApplicable: 20 }), audit({ checksApplicable: 25 }));
    expect(c.caveat).toBe("different_coverage");
  });

  it("no avisa cuando la cobertura es la misma", () => {
    expect(compareAudits(audit(), audit()).caveat).toBeNull();
  });

  it("expone los recuentos de comprobaciones de ambos lados", () => {
    const c = compareAudits(
      audit({ checksPassed: 9, checksApplicable: 20 }),
      audit({ checksPassed: 15, checksApplicable: 20 })
    );
    expect(c.checks).toEqual({ before: "9/20", after: "15/20" });
  });
});

describe("agrupación del historial", () => {
  it("agrupa por URL y descarta las que sólo tienen una auditoría", () => {
    const groups = comparableGroups([
      entry("https://a.test/", "2026-01-01T00:00:00Z"),
      entry("https://a.test/", "2026-02-01T00:00:00Z"),
      entry("https://b.test/", "2026-01-01T00:00:00Z"),
    ]);
    expect([...groups.keys()]).toEqual(["https://a.test/"]);
  });

  it("ordena cada grupo de más antigua a más reciente", () => {
    const groups = comparableGroups([
      entry("https://a.test/", "2026-03-01T00:00:00Z", 70),
      entry("https://a.test/", "2026-01-01T00:00:00Z", 40),
      entry("https://a.test/", "2026-02-01T00:00:00Z", 55),
    ]);
    expect(groups.get("https://a.test/")!.map((e) => e.score)).toEqual([40, 55, 70]);
  });

  it("devuelve un mapa vacío si nada es comparable", () => {
    expect(comparableGroups([entry("https://a.test/", "2026-01-01T00:00:00Z")]).size).toBe(0);
  });
});
