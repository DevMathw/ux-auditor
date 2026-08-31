import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auditCacheKey, getCachedAudit, setCachedAudit } from "@/app/lib/auditCache";
import type { AuditChecks, AuditResult } from "@/app/lib/types";

const CHECKS: AuditChecks = { accessibility: true, visualHierarchy: true, uxClarity: true };

function audit(score = 50): AuditResult {
  return {
    version: 2,
    overallScore: score,
    scoreBreakdown: { accessibility: null, visualHierarchy: null, uxClarity: null },
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
  };
}

let seq = 0;
/** HTML único por test, para que cada uno tenga su propia entrada. */
const html = () => `<html><body><p>fixture ${++seq}</p></body></html>`;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("clave de caché", () => {
  it("el mismo contenido produce la misma clave", () => {
    const h = html();
    expect(auditCacheKey(h, CHECKS, "en", true, false)).toBe(
      auditCacheKey(h, CHECKS, "en", true, false)
    );
  });

  it("contenido distinto produce clave distinta", () => {
    expect(auditCacheKey(html(), CHECKS, "en", true, false)).not.toBe(
      auditCacheKey(html(), CHECKS, "en", true, false)
    );
  });

  it("el idioma forma parte de la clave", () => {
    const h = html();
    expect(auditCacheKey(h, CHECKS, "en", true, false)).not.toBe(
      auditCacheKey(h, CHECKS, "es", true, false)
    );
  });

  it("las áreas seleccionadas forman parte de la clave", () => {
    const h = html();
    expect(auditCacheKey(h, CHECKS, "en", true, false)).not.toBe(
      auditCacheKey(h, { ...CHECKS, uxClarity: false }, "en", true, false)
    );
  });

  it("la capa de IA forma parte de la clave", () => {
    const h = html();
    expect(auditCacheKey(h, CHECKS, "en", true, false)).not.toBe(
      auditCacheKey(h, CHECKS, "en", false, false)
    );
  });

  it("el renderizado forma parte de la clave", () => {
    // Un informe con reglas visuales no es el mismo informe que uno sin ellas.
    const h = html();
    expect(auditCacheKey(h, CHECKS, "en", true, false)).not.toBe(
      auditCacheKey(h, CHECKS, "en", true, true)
    );
  });

  it("el orden de las claves de checks no altera la clave", () => {
    const h = html();
    const a = auditCacheKey(h, { accessibility: true, visualHierarchy: false, uxClarity: true }, "en", true, false);
    const b = auditCacheKey(h, { uxClarity: true, accessibility: true, visualHierarchy: false }, "en", true, false);
    expect(a).toBe(b);
  });
});

describe("lectura y escritura", () => {
  it("devuelve null cuando no hay entrada", () => {
    expect(getCachedAudit(auditCacheKey(html(), CHECKS, "en", true, false))).toBeNull();
  });

  it("devuelve la entrada guardada", () => {
    const k = auditCacheKey(html(), CHECKS, "en", true, false);
    const value = audit(73);
    setCachedAudit(k, value);
    expect(getCachedAudit(k)?.overallScore).toBe(73);
  });

  it("sobrescribe una entrada existente", () => {
    const k = auditCacheKey(html(), CHECKS, "en", true, false);
    setCachedAudit(k, audit(10));
    setCachedAudit(k, audit(90));
    expect(getCachedAudit(k)?.overallScore).toBe(90);
  });
});

describe("expiración", () => {
  it("mantiene la entrada dentro del TTL", () => {
    const k = auditCacheKey(html(), CHECKS, "en", true, false);
    setCachedAudit(k, audit());
    vi.advanceTimersByTime(29 * 60_000);
    expect(getCachedAudit(k)).not.toBeNull();
  });

  it("descarta la entrada pasado el TTL de 30 minutos", () => {
    const k = auditCacheKey(html(), CHECKS, "en", true, false);
    setCachedAudit(k, audit());
    vi.advanceTimersByTime(30 * 60_000 + 1);
    expect(getCachedAudit(k)).toBeNull();
  });

  it("una entrada caducada se elimina, no sólo se oculta", () => {
    const k = auditCacheKey(html(), CHECKS, "en", true, false);
    setCachedAudit(k, audit(42));
    vi.advanceTimersByTime(31 * 60_000);
    expect(getCachedAudit(k)).toBeNull();
    // Tras la purga, una escritura nueva vuelve a funcionar con normalidad.
    setCachedAudit(k, audit(7));
    expect(getCachedAudit(k)?.overallScore).toBe(7);
  });
});

describe("desalojo LRU", () => {
  it("no supera MAX_ENTRIES", () => {
    const keys = Array.from({ length: 260 }, (_, i) =>
      auditCacheKey(`<html><body>lru-${i}</body></html>`, CHECKS, "en", true, false)
    );
    keys.forEach((k, i) => setCachedAudit(k, audit(i)));

    // Con MAX_ENTRIES = 200, las primeras deben haber sido expulsadas.
    const survivors = keys.filter((k) => getCachedAudit(k) !== null);
    expect(survivors.length).toBeLessThanOrEqual(200);
    // Y las últimas escritas siguen ahí.
    expect(getCachedAudit(keys[keys.length - 1])).not.toBeNull();
  });

  it("leer una entrada la protege del desalojo", () => {
    const first = auditCacheKey("<html><body>protected</body></html>", CHECKS, "en", true, false);
    setCachedAudit(first, audit(1));

    // Se llena la caché, tocando la primera entrada por el camino.
    for (let i = 0; i < 150; i++) {
      setCachedAudit(
        auditCacheKey(`<html><body>filler-a-${i}</body></html>`, CHECKS, "en", true, false),
        audit(i)
      );
      getCachedAudit(first);
    }
    for (let i = 0; i < 60; i++) {
      setCachedAudit(
        auditCacheKey(`<html><body>filler-b-${i}</body></html>`, CHECKS, "en", true, false),
        audit(i)
      );
      getCachedAudit(first);
    }

    // Al haberse leído en cada vuelta, sigue siendo la más reciente.
    expect(getCachedAudit(first)).not.toBeNull();
  });
});
