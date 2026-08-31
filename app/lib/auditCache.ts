import { createHash } from "node:crypto";
import type { AuditChecks, AuditResult } from "./types";

/**
 * Caché por hash del contenido, no por URL: si la página no ha cambiado, la
 * auditoría es la misma y no hay que volver a pagar la llamada al modelo.
 * Es también la defensa contra el usuario que pulsa "analizar" diez veces.
 */
const TTL_MS = 30 * 60_000;
const MAX_ENTRIES = 200;

interface CacheEntry {
  audit: AuditResult;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export function auditCacheKey(
  html: string,
  checks: AuditChecks,
  language: string,
  aiEnabled: boolean,
  rendered: boolean
): string {
  const shape = (Object.keys(checks) as (keyof AuditChecks)[])
    .sort()
    .map((k) => `${k}=${checks[k] ? 1 : 0}`)
    .join(",");
  return createHash("sha256")
    .update(html)
    .update(`|${shape}|${language}|ai=${aiEnabled ? 1 : 0}|render=${rendered ? 1 : 0}`)
    .digest("hex");
}

export function getCachedAudit(key: string): AuditResult | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  // Refresca la posición para que el LRU expulse lo menos usado.
  cache.delete(key);
  cache.set(key, entry);
  return entry.audit;
}

export function setCachedAudit(key: string, audit: AuditResult): void {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { audit, expiresAt: Date.now() + TTL_MS });
}
