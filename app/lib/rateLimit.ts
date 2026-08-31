import type { NextRequest } from "next/server";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
/** Purga entradas caducadas de vez en cuando para que el Map no crezca sin fin. */
let lastSweep = 0;

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Identifica al cliente. En Vercel/proxies el primer valor de x-forwarded-for
 * es la IP real del usuario; en local no hay cabecera y todo cae en "local".
 */
export function clientKey(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "local";
}

export interface RateLimitResult {
  ok: boolean;
  /** Segundos que faltan para poder reintentar. */
  retryAfter: number;
}

/**
 * Ventana fija en memoria. Suficiente para frenar el abuso trivial de un
 * endpoint que consume créditos de API; con varias instancias cada una lleva su
 * propia cuenta, así que en producción real conviene un store compartido.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfter: 0 };
}
