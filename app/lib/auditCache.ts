import { createHash } from "node:crypto";
import { getStore } from "./storage";
import type { AuditChecks, AuditResult } from "./types";

/**
 * Caché por hash del contenido, no por URL: si la página no ha cambiado, la
 * auditoría es la misma y no hay que volver a pagar la llamada al modelo.
 * Es también la defensa contra el usuario que pulsa "analizar" diez veces.
 *
 * La entrada vive en el store, así que con SQLite sobrevive a un reinicio y en
 * memoria se comporta como antes. La expulsión y el TTL los aplica el store.
 */
const TTL_MS = 30 * 60_000;

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

export async function getCachedAudit(key: string): Promise<AuditResult | null> {
  // Un fallo de la caché nunca debe impedir una auditoría: se trata como fallo.
  try {
    return (await getStore()).cache.get(key);
  } catch {
    return null;
  }
}

export async function setCachedAudit(key: string, audit: AuditResult): Promise<void> {
  try {
    (await getStore()).cache.set(key, audit, TTL_MS);
  } catch {
    // Guardar en caché es una optimización; no vale perder la respuesta por ella.
  }
}
