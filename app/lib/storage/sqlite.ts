import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { AuditResult } from "../types";
import { generateKey } from "./memory";
import type {
  ApiKeyRecord,
  ApiKeyRepository,
  AuditRepository,
  CacheRepository,
  ErrorRepository,
  Store,
  StoredAudit,
  StoredError,
} from "./types";

/**
 * Almacenamiento en SQLite, vía el módulo `node:sqlite` que trae Node.
 *
 * Se eligió frente a better-sqlite3 porque no añade ninguna dependencia ni
 * requiere compilación nativa: quien clone el repositorio hace `npm install` y
 * ya está. El precio es que la API está marcada como experimental y exige
 * Node 22.5+; ambas cosas están documentadas en el README.
 *
 * No funciona en Vercel: allí sólo /tmp es escribible y es efímero y por
 * instancia, así que el proveedor cae a memoria. Eso no se disimula — se
 * reporta en /api/health.
 */

/** Migraciones en orden. Nunca se edita una ya aplicada: se añade otra. */
const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE audits (
        id            TEXT PRIMARY KEY,
        session_id    TEXT NOT NULL,
        url           TEXT NOT NULL,
        score         INTEGER NOT NULL,
        language      TEXT NOT NULL,
        created_at    TEXT NOT NULL,
        payload       TEXT NOT NULL,
        share_id      TEXT UNIQUE
      );
      CREATE INDEX idx_audits_session ON audits (session_id, created_at DESC);
      CREATE INDEX idx_audits_created ON audits (created_at);

      CREATE TABLE api_keys (
        id                TEXT PRIMARY KEY,
        key_hash          TEXT NOT NULL UNIQUE,
        label             TEXT NOT NULL,
        created_at        TEXT NOT NULL,
        revoked_at        TEXT,
        quota             INTEGER NOT NULL,
        used              INTEGER NOT NULL DEFAULT 0,
        window_started_at TEXT NOT NULL
      );

      CREATE TABLE errors (
        id         TEXT PRIMARY KEY,
        event      TEXT NOT NULL,
        message    TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_errors_created ON errors (created_at DESC);

      CREATE TABLE cache (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX idx_cache_expires ON cache (expires_at);
    `,
  },
];

interface AuditRow {
  id: string;
  session_id: string;
  url: string;
  score: number;
  language: string;
  created_at: string;
  payload: string;
  share_id: string | null;
}

interface KeyRow {
  id: string;
  key_hash: string;
  label: string;
  created_at: string;
  revoked_at: string | null;
  quota: number;
  used: number;
  window_started_at: string;
}

function toAudit(row: AuditRow): StoredAudit {
  return {
    id: row.id,
    sessionId: row.session_id,
    url: row.url,
    score: row.score,
    language: row.language === "es" ? "es" : "en",
    createdAt: row.created_at,
    audit: JSON.parse(row.payload) as AuditResult,
    shareId: row.share_id,
  };
}

function toKey(row: KeyRow): ApiKeyRecord {
  return {
    id: row.id,
    keyHash: row.key_hash,
    label: row.label,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
    quota: row.quota,
    used: row.used,
    windowStartedAt: row.window_started_at,
  };
}

function migrate(db: DatabaseSync): void {
  db.exec("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)");
  const row = db.prepare("SELECT MAX(version) AS v FROM schema_version").get() as
    | { v: number | null }
    | undefined;
  const current = row?.v ?? 0;

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    db.exec("BEGIN");
    try {
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(migration.version);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}

export function createSqliteStore(filename: string, displayLocation: string): Store {
  const db = new DatabaseSync(filename);

  // WAL permite lecturas concurrentes con una escritura, que es el patrón real
  // de esta aplicación. foreign_keys por corrección, aunque aún no haya FKs.
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);

  const audits: AuditRepository = {
    save(input) {
      const record: StoredAudit = { ...input, id: randomUUID(), shareId: null };
      db.prepare(
        `INSERT INTO audits (id, session_id, url, score, language, created_at, payload, share_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`
      ).run(
        record.id,
        record.sessionId,
        record.url,
        record.score,
        record.language,
        record.createdAt,
        JSON.stringify(record.audit)
      );
      return record;
    },

    listBySession(sessionId, limit = 20) {
      const rows = db
        .prepare(
          "SELECT * FROM audits WHERE session_id = ? ORDER BY created_at DESC LIMIT ?"
        )
        .all(sessionId, limit) as unknown as AuditRow[];
      return rows.map(toAudit);
    },

    findById(id, sessionId) {
      // La sesión va en el WHERE, no en una comprobación posterior: así un id
      // adivinado nunca llega a leerse.
      const row = db
        .prepare("SELECT * FROM audits WHERE id = ? AND session_id = ?")
        .get(id, sessionId) as unknown as AuditRow | undefined;
      return row ? toAudit(row) : null;
    },

    findByShareId(shareId) {
      const row = db
        .prepare("SELECT * FROM audits WHERE share_id = ?")
        .get(shareId) as unknown as AuditRow | undefined;
      return row ? toAudit(row) : null;
    },

    share(id, sessionId) {
      const existing = this.findById(id, sessionId);
      if (!existing) return null;
      if (existing.shareId) return existing.shareId;
      const shareId = randomUUID().replace(/-/g, "").slice(0, 22);
      db.prepare("UPDATE audits SET share_id = ? WHERE id = ? AND session_id = ?").run(
        shareId,
        id,
        sessionId
      );
      return shareId;
    },

    unshare(id, sessionId) {
      const result = db
        .prepare("UPDATE audits SET share_id = NULL WHERE id = ? AND session_id = ? AND share_id IS NOT NULL")
        .run(id, sessionId);
      return Number(result.changes) > 0;
    },

    delete(id, sessionId) {
      const result = db
        .prepare("DELETE FROM audits WHERE id = ? AND session_id = ?")
        .run(id, sessionId);
      return Number(result.changes) > 0;
    },

    deleteSession(sessionId) {
      const result = db.prepare("DELETE FROM audits WHERE session_id = ?").run(sessionId);
      return Number(result.changes);
    },

    pruneOlderThan(days) {
      const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
      const result = db.prepare("DELETE FROM audits WHERE created_at < ?").run(cutoff);
      return Number(result.changes);
    },
  };

  const apiKeys: ApiKeyRepository = {
    create(label, quota) {
      const { secret, hash } = generateKey();
      const record: ApiKeyRecord = {
        id: randomUUID(),
        keyHash: hash,
        label,
        createdAt: new Date().toISOString(),
        revokedAt: null,
        quota,
        used: 0,
        windowStartedAt: new Date().toISOString(),
      };
      db.prepare(
        `INSERT INTO api_keys (id, key_hash, label, created_at, revoked_at, quota, used, window_started_at)
         VALUES (?, ?, ?, ?, NULL, ?, 0, ?)`
      ).run(record.id, record.keyHash, record.label, record.createdAt, record.quota, record.windowStartedAt);
      return { record, secret };
    },

    findByHash(keyHash) {
      const row = db
        .prepare("SELECT * FROM api_keys WHERE key_hash = ?")
        .get(keyHash) as unknown as KeyRow | undefined;
      return row ? toKey(row) : null;
    },

    consume(id, windowMs) {
      const row = db.prepare("SELECT * FROM api_keys WHERE id = ?").get(id) as unknown as
        | KeyRow
        | undefined;
      if (!row || row.revoked_at) return false;

      if (Date.now() - Date.parse(row.window_started_at) >= windowMs) {
        db.prepare("UPDATE api_keys SET used = 1, window_started_at = ? WHERE id = ?").run(
          new Date().toISOString(),
          id
        );
        return true;
      }
      if (row.used >= row.quota) return false;
      db.prepare("UPDATE api_keys SET used = used + 1 WHERE id = ?").run(id);
      return true;
    },

    revoke(id) {
      const result = db
        .prepare("UPDATE api_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL")
        .run(new Date().toISOString(), id);
      return Number(result.changes) > 0;
    },

    list() {
      const rows = db
        .prepare("SELECT * FROM api_keys ORDER BY created_at DESC")
        .all() as unknown as KeyRow[];
      return rows.map(toKey);
    },
  };

  const errors: ErrorRepository = {
    record(event, message) {
      db.prepare("INSERT INTO errors (id, event, message, created_at) VALUES (?, ?, ?, ?)").run(
        randomUUID(),
        event,
        message.slice(0, 500),
        new Date().toISOString()
      );
      // Anillo acotado: sin esto la tabla crece sin fin.
      db.exec(
        "DELETE FROM errors WHERE id NOT IN (SELECT id FROM errors ORDER BY created_at DESC LIMIT 100)"
      );
    },
    recent(limit = 50) {
      return db
        .prepare("SELECT * FROM errors ORDER BY created_at DESC LIMIT ?")
        .all(limit) as unknown as StoredError[];
    },
    clear() {
      db.exec("DELETE FROM errors");
    },
  };

  const cache: CacheRepository = {
    get(key) {
      const row = db.prepare("SELECT value, expires_at FROM cache WHERE key = ?").get(key) as
        | { value: string; expires_at: number }
        | undefined;
      if (!row) return null;
      if (row.expires_at <= Date.now()) {
        db.prepare("DELETE FROM cache WHERE key = ?").run(key);
        return null;
      }
      return JSON.parse(row.value) as AuditResult;
    },
    set(key, value, ttlMs) {
      db.prepare(
        "INSERT INTO cache (key, value, expires_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at"
      ).run(key, JSON.stringify(value), Date.now() + ttlMs);
      db.prepare("DELETE FROM cache WHERE expires_at <= ?").run(Date.now());
    },
  };

  return {
    kind: "sqlite",
    // Sólo el nombre, nunca la ruta absoluta: acaba en /api/health.
    location: displayLocation,
    audits,
    apiKeys,
    errors,
    cache,
    close() {
      db.close();
    },
  };
}
