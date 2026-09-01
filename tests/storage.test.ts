import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryStore, generateKey, hashKey } from "@/app/lib/storage/memory";
import { createSqliteStore } from "@/app/lib/storage/sqlite";
import type { Store } from "@/app/lib/storage/types";
import type { AuditResult } from "@/app/lib/types";

/**
 * Un solo conjunto de aserciones contra las dos implementaciones.
 *
 * Es la única forma honesta de decir que memoria y SQLite son intercambiables:
 * si el contrato sólo se prueba contra una, la otra diverge en cuanto se toca.
 */

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

function save(store: Store, sessionId: string, url = "https://example.com", score = 50) {
  return store.audits.save({
    sessionId,
    url,
    score,
    language: "en",
    createdAt: new Date().toISOString(),
    audit: audit(score),
  });
}

const tempDirs: string[] = [];

function newSqlite(): Store {
  const dir = mkdtempSync(join(tmpdir(), "uxa-test-"));
  tempDirs.push(dir);
  return createSqliteStore(join(dir, "test.db"), "test.db");
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

const implementations: [string, () => Store][] = [
  ["memoria", createMemoryStore],
  ["sqlite", newSqlite],
];

describe.each(implementations)("contrato del store (%s)", (_name, create) => {
  let store: Store;

  beforeEach(() => {
    store = create();
  });

  afterEach(() => {
    store.close();
  });

  describe("auditorías", () => {
    it("guarda y devuelve un id", () => {
      const record = save(store, "s1");
      expect(record.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(record.shareId).toBeNull();
    });

    it("el historial es de la sesión, no global", () => {
      save(store, "s1");
      save(store, "s2");
      expect(store.audits.listBySession("s1")).toHaveLength(1);
      expect(store.audits.listBySession("s2")).toHaveLength(1);
      expect(store.audits.listBySession("s3")).toHaveLength(0);
    });

    it("el historial devuelve lo más reciente primero", () => {
      store.audits.save({
        sessionId: "s1",
        url: "https://viejo.com",
        score: 1,
        language: "en",
        createdAt: "2020-01-01T00:00:00.000Z",
        audit: audit(1),
      });
      store.audits.save({
        sessionId: "s1",
        url: "https://nuevo.com",
        score: 2,
        language: "en",
        createdAt: "2026-01-01T00:00:00.000Z",
        audit: audit(2),
      });
      expect(store.audits.listBySession("s1")[0].url).toBe("https://nuevo.com");
    });

    it("respeta el límite pedido", () => {
      for (let i = 0; i < 5; i++) save(store, "s1");
      expect(store.audits.listBySession("s1", 2)).toHaveLength(2);
    });

    it("un id de otra sesión no se puede leer", () => {
      const ajena = save(store, "s2");
      expect(store.audits.findById(ajena.id, "s1")).toBeNull();
      expect(store.audits.findById(ajena.id, "s2")).not.toBeNull();
    });

    it("conserva el informe completo, no sólo la puntuación", () => {
      const record = save(store, "s1", "https://example.com", 73);
      const leido = store.audits.findById(record.id, "s1");
      expect(leido?.audit.overallScore).toBe(73);
      expect(leido?.audit.version).toBe(2);
    });

    it("borra sólo lo suyo", () => {
      const propia = save(store, "s1");
      const ajena = save(store, "s2");
      expect(store.audits.delete(ajena.id, "s1")).toBe(false);
      expect(store.audits.delete(propia.id, "s1")).toBe(true);
      expect(store.audits.listBySession("s2")).toHaveLength(1);
    });

    it("borra la sesión entera y devuelve cuántas", () => {
      save(store, "s1");
      save(store, "s1");
      save(store, "s2");
      expect(store.audits.deleteSession("s1")).toBe(2);
      expect(store.audits.listBySession("s1")).toHaveLength(0);
      expect(store.audits.listBySession("s2")).toHaveLength(1);
    });

    it("la retención descarta lo anterior a la ventana", () => {
      store.audits.save({
        sessionId: "s1",
        url: "https://viejo.com",
        score: 1,
        language: "en",
        createdAt: new Date(Date.now() - 40 * 86_400_000).toISOString(),
        audit: audit(1),
      });
      save(store, "s1");
      expect(store.audits.pruneOlderThan(30)).toBe(1);
      expect(store.audits.listBySession("s1")).toHaveLength(1);
    });
  });

  describe("compartir", () => {
    it("genera un identificador distinto del id interno", () => {
      const record = save(store, "s1");
      const shareId = store.audits.share(record.id, "s1");
      expect(shareId).toMatch(/^[0-9a-f]{22}$/);
      expect(shareId).not.toBe(record.id);
    });

    it("compartir dos veces devuelve el mismo enlace", () => {
      const record = save(store, "s1");
      expect(store.audits.share(record.id, "s1")).toBe(store.audits.share(record.id, "s1"));
    });

    it("no se puede compartir lo de otra sesión", () => {
      const ajena = save(store, "s2");
      expect(store.audits.share(ajena.id, "s1")).toBeNull();
    });

    it("el enlace se abre sin sesión", () => {
      const record = save(store, "s1", "https://compartida.com");
      const shareId = store.audits.share(record.id, "s1")!;
      expect(store.audits.findByShareId(shareId)?.url).toBe("https://compartida.com");
    });

    it("dejar de compartir invalida el enlace pero conserva la auditoría", () => {
      const record = save(store, "s1");
      const shareId = store.audits.share(record.id, "s1")!;
      expect(store.audits.unshare(record.id, "s1")).toBe(true);
      expect(store.audits.findByShareId(shareId)).toBeNull();
      expect(store.audits.findById(record.id, "s1")).not.toBeNull();
    });

    it("borrar la auditoría invalida su enlace", () => {
      const record = save(store, "s1");
      const shareId = store.audits.share(record.id, "s1")!;
      store.audits.delete(record.id, "s1");
      expect(store.audits.findByShareId(shareId)).toBeNull();
    });

    it("un identificador inexistente devuelve null, no revienta", () => {
      expect(store.audits.findByShareId("0".repeat(22))).toBeNull();
    });
  });

  describe("claves de API", () => {
    it("el secreto se devuelve una vez y no queda guardado", () => {
      const { record, secret } = store.apiKeys.create("cli", 10);
      expect(secret).toMatch(/^uxa_[0-9a-f]{40}$/);
      expect(record.keyHash).toBe(hashKey(secret));
      expect(JSON.stringify(record)).not.toContain(secret);
    });

    it("se encuentra por el hash, nunca por el secreto", () => {
      const { record, secret } = store.apiKeys.create("cli", 10);
      expect(store.apiKeys.findByHash(hashKey(secret))?.id).toBe(record.id);
      expect(store.apiKeys.findByHash(secret)).toBeNull();
    });

    it("la cuota se agota y no se pasa de ahí", () => {
      const { record } = store.apiKeys.create("cli", 2);
      expect(store.apiKeys.consume(record.id, 60_000)).toBe(true);
      expect(store.apiKeys.consume(record.id, 60_000)).toBe(true);
      expect(store.apiKeys.consume(record.id, 60_000)).toBe(false);
    });

    it("la cuota se reinicia al pasar la ventana", () => {
      const { record } = store.apiKeys.create("cli", 1);
      expect(store.apiKeys.consume(record.id, 60_000)).toBe(true);
      expect(store.apiKeys.consume(record.id, 60_000)).toBe(false);
      // Ventana de 0 ms: cualquier instante posterior ya la ha superado.
      expect(store.apiKeys.consume(record.id, 0)).toBe(true);
    });

    it("una clave revocada no consume aunque le quede cuota", () => {
      const { record } = store.apiKeys.create("cli", 100);
      expect(store.apiKeys.revoke(record.id)).toBe(true);
      expect(store.apiKeys.consume(record.id, 60_000)).toBe(false);
    });

    it("revocar dos veces no cambia nada", () => {
      const { record } = store.apiKeys.create("cli", 1);
      store.apiKeys.revoke(record.id);
      expect(store.apiKeys.revoke(record.id)).toBe(false);
    });

    it("una clave inexistente no consume ni revoca", () => {
      expect(store.apiKeys.consume("no-existe", 60_000)).toBe(false);
      expect(store.apiKeys.revoke("no-existe")).toBe(false);
    });
  });

  describe("errores", () => {
    it("guarda y devuelve lo más reciente primero", () => {
      store.errors.record("a", "primero");
      store.errors.record("b", "segundo");
      expect(store.errors.recent()[0].message).toBe("segundo");
    });

    it("acota el mensaje a 500 caracteres", () => {
      store.errors.record("a", "x".repeat(900));
      expect(store.errors.recent()[0].message).toHaveLength(500);
    });

    it("no crece sin límite", () => {
      for (let i = 0; i < 140; i++) store.errors.record("a", `error ${i}`);
      expect(store.errors.recent(200).length).toBeLessThanOrEqual(100);
    });

    it("se puede vaciar", () => {
      store.errors.record("a", "algo");
      store.errors.clear();
      expect(store.errors.recent()).toHaveLength(0);
    });
  });

  describe("caché", () => {
    it("devuelve lo guardado", () => {
      store.cache.set("k", audit(88), 60_000);
      expect(store.cache.get("k")?.overallScore).toBe(88);
    });

    it("devuelve null para una clave desconocida", () => {
      expect(store.cache.get("no-existe")).toBeNull();
    });

    it("una entrada caducada no se devuelve", () => {
      store.cache.set("k", audit(), -1);
      expect(store.cache.get("k")).toBeNull();
    });

    it("sobrescribe", () => {
      store.cache.set("k", audit(10), 60_000);
      store.cache.set("k", audit(90), 60_000);
      expect(store.cache.get("k")?.overallScore).toBe(90);
    });
  });
});

describe("persistencia real de sqlite", () => {
  it("los datos sobreviven a cerrar y reabrir el fichero", () => {
    const dir = mkdtempSync(join(tmpdir(), "uxa-persist-"));
    tempDirs.push(dir);
    const file = join(dir, "persist.db");

    const primero = createSqliteStore(file, "persist.db");
    const record = save(primero, "s1", "https://persistente.com");
    const shareId = primero.audits.share(record.id, "s1")!;
    primero.close();

    // Reabrir ejerce además las migraciones: deben ser idempotentes.
    const segundo = createSqliteStore(file, "persist.db");
    expect(segundo.audits.listBySession("s1")).toHaveLength(1);
    expect(segundo.audits.findByShareId(shareId)?.url).toBe("https://persistente.com");
    segundo.close();
  });

  it("informa de dónde vive sin revelar la ruta absoluta", () => {
    const store = newSqlite();
    expect(store.location).toBe("test.db");
    expect(store.location).not.toContain(tmpdir());
    store.close();
  });
});

describe("generación de claves", () => {
  it("dos claves nunca coinciden", () => {
    const secretos = new Set(Array.from({ length: 200 }, () => generateKey().secret));
    expect(secretos.size).toBe(200);
  });

  it("el hash es estable y no revela el secreto", () => {
    const { secret, hash } = generateKey();
    expect(hashKey(secret)).toBe(hash);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(secret.slice(4));
  });
});
