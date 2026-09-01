import type { NextRequest } from "next/server";
import { getStore, hashKey } from "./storage";
import type { ApiKeyRecord } from "./storage/types";

/**
 * Autenticación por clave de API.
 *
 * La clave es OPCIONAL. Sin ella la aplicación funciona igual, limitada por IP.
 * Con ella, el límite pasa a ser la cuota de la clave, que es lo que hace falta
 * para llamar desde CI o desde un script: una IP compartida no sirve de
 * identidad, y una clave sí.
 *
 * Nunca se guarda el secreto, sólo su SHA-256. Una filtración de la base de
 * datos no entrega claves utilizables.
 */

/** Ventana de cuota. 24 h es lo que espera quien integra esto en CI. */
export const QUOTA_WINDOW_MS = 24 * 60 * 60_000;
export const DEFAULT_QUOTA = 100;

const KEY_RE = /^uxa_[0-9a-f]{40}$/;

export type KeyAuth =
  | { status: "anonymous" }
  | { status: "invalid" }
  | { status: "revoked" }
  | { status: "quota_exceeded"; record: ApiKeyRecord }
  | { status: "ok"; record: ApiKeyRecord };

function extractKey(req: NextRequest): string | null {
  const header =
    req.headers.get("x-api-key") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  return header ? header.trim() : null;
}

/**
 * Resuelve la clave de la petición y consume una unidad de cuota si es válida.
 *
 * Consume aquí, antes de auditar, a propósito: si se cobrase al terminar, una
 * petición cancelada saldría gratis y la cuota dejaría de significar nada.
 */
export async function authenticateKey(req: NextRequest): Promise<KeyAuth> {
  const presented = extractKey(req);
  if (!presented) return { status: "anonymous" };
  // Se comprueba la forma antes de tocar la base de datos: así una cabecera
  // basura no genera una consulta por cada petición.
  if (!KEY_RE.test(presented)) return { status: "invalid" };

  const store = await getStore();
  const record = store.apiKeys.findByHash(hashKey(presented));
  if (!record) return { status: "invalid" };
  if (record.revokedAt) return { status: "revoked" };

  if (!store.apiKeys.consume(record.id, QUOTA_WINDOW_MS)) {
    return { status: "quota_exceeded", record };
  }
  return { status: "ok", record };
}

/** Segundos hasta que la ventana de cuota se reinicia. */
export function quotaResetSeconds(record: ApiKeyRecord): number {
  const elapsed = Date.now() - Date.parse(record.windowStartedAt);
  return Math.max(1, Math.ceil((QUOTA_WINDOW_MS - elapsed) / 1000));
}
