import { createHash, randomUUID } from "node:crypto";
import type { AuditResult } from "../types";
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
 * Implementación en memoria.
 *
 * Es la que corre en Vercel, donde el disco es efímero y por instancia. No es
 * un modo degradado a medias: la aplicación funciona entera, sólo que el
 * historial y los enlaces compartidos viven mientras viva el proceso.
 *
 * También es la que usan los tests, que así no tocan disco.
 */

const MAX_AUDITS = 500;
const MAX_ERRORS = 100;

export function createMemoryStore(): Store {
  const audits = new Map<string, StoredAudit>();
  const shares = new Map<string, string>();
  const keys = new Map<string, ApiKeyRecord>();
  const errors: StoredError[] = [];
  const cache = new Map<string, { value: AuditResult; expiresAt: number }>();

  const auditRepo: AuditRepository = {
    save(input) {
      const record: StoredAudit = { ...input, id: randomUUID(), shareId: null };
      audits.set(record.id, record);
      // Tope duro: sin él, un proceso largo crecería sin límite.
      if (audits.size > MAX_AUDITS) {
        const oldest = audits.keys().next().value;
        if (oldest) {
          const dropped = audits.get(oldest);
          if (dropped?.shareId) shares.delete(dropped.shareId);
          audits.delete(oldest);
        }
      }
      return record;
    },

    listBySession(sessionId, limit = 20) {
      return [...audits.values()]
        .filter((a) => a.sessionId === sessionId)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, limit);
    },

    findById(id, sessionId) {
      const found = audits.get(id);
      // Comprobar la sesión evita que un id adivinado exponga el informe ajeno.
      return found && found.sessionId === sessionId ? found : null;
    },

    findByShareId(shareId) {
      const id = shares.get(shareId);
      return id ? (audits.get(id) ?? null) : null;
    },

    share(id, sessionId) {
      const found = audits.get(id);
      if (!found || found.sessionId !== sessionId) return null;
      if (found.shareId) return found.shareId;
      const shareId = randomUUID().replace(/-/g, "").slice(0, 22);
      found.shareId = shareId;
      shares.set(shareId, id);
      return shareId;
    },

    unshare(id, sessionId) {
      const found = audits.get(id);
      if (!found || found.sessionId !== sessionId || !found.shareId) return false;
      shares.delete(found.shareId);
      found.shareId = null;
      return true;
    },

    delete(id, sessionId) {
      const found = audits.get(id);
      if (!found || found.sessionId !== sessionId) return false;
      if (found.shareId) shares.delete(found.shareId);
      return audits.delete(id);
    },

    deleteSession(sessionId) {
      let removed = 0;
      for (const [id, record] of audits) {
        if (record.sessionId !== sessionId) continue;
        if (record.shareId) shares.delete(record.shareId);
        audits.delete(id);
        removed++;
      }
      return removed;
    },

    pruneOlderThan(days) {
      const cutoff = Date.now() - days * 86_400_000;
      let removed = 0;
      for (const [id, record] of audits) {
        if (Date.parse(record.createdAt) >= cutoff) continue;
        if (record.shareId) shares.delete(record.shareId);
        audits.delete(id);
        removed++;
      }
      return removed;
    },
  };

  const apiKeyRepo: ApiKeyRepository = {
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
      keys.set(record.id, record);
      return { record, secret };
    },

    findByHash(keyHash) {
      for (const record of keys.values()) if (record.keyHash === keyHash) return record;
      return null;
    },

    consume(id, windowMs) {
      const record = keys.get(id);
      if (!record || record.revokedAt) return false;

      if (Date.now() - Date.parse(record.windowStartedAt) >= windowMs) {
        record.used = 0;
        record.windowStartedAt = new Date().toISOString();
      }
      if (record.used >= record.quota) return false;
      record.used += 1;
      return true;
    },

    revoke(id) {
      const record = keys.get(id);
      if (!record || record.revokedAt) return false;
      record.revokedAt = new Date().toISOString();
      return true;
    },

    list() {
      return [...keys.values()];
    },
  };

  const errorRepo: ErrorRepository = {
    record(event, message) {
      errors.unshift({
        id: randomUUID(),
        event,
        message: message.slice(0, 500),
        createdAt: new Date().toISOString(),
      });
      if (errors.length > MAX_ERRORS) errors.length = MAX_ERRORS;
    },
    recent(limit = 50) {
      return errors.slice(0, limit);
    },
    clear() {
      errors.length = 0;
    },
  };

  const cacheRepo: CacheRepository = {
    get(key) {
      const hit = cache.get(key);
      if (!hit) return null;
      if (hit.expiresAt <= Date.now()) {
        cache.delete(key);
        return null;
      }
      // Refresca la posición para que el LRU expulse lo menos usado.
      cache.delete(key);
      cache.set(key, hit);
      return hit.value;
    },
    set(key, value, ttlMs) {
      if (cache.size >= 200) {
        const oldest = cache.keys().next().value;
        if (oldest) cache.delete(oldest);
      }
      cache.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
  };

  return {
    kind: "memory",
    location: "in-process",
    audits: auditRepo,
    apiKeys: apiKeyRepo,
    errors: errorRepo,
    cache: cacheRepo,
    close() {
      audits.clear();
      shares.clear();
      keys.clear();
      cache.clear();
      errors.length = 0;
    },
  };
}

/**
 * Genera una clave de API y su hash.
 *
 * El secreto se devuelve una sola vez y NUNCA se guarda: sólo su SHA-256. Si
 * alguien roba la base de datos, no se lleva claves utilizables.
 */
export function generateKey(): { secret: string; hash: string } {
  const secret = `uxa_${randomUUID().replace(/-/g, "")}${randomUUID().replace(/-/g, "").slice(0, 8)}`;
  return { secret, hash: hashKey(secret) };
}

export function hashKey(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}
