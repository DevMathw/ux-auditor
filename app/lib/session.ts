import { randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

/**
 * Sesión anónima.
 *
 * Es un identificador aleatorio en una cookie httpOnly, y nada más: no hay
 * cuenta, ni correo, ni contraseña. Existe sólo para responder a dos preguntas
 * — "¿qué he auditado yo?" y "borra lo mío" — sin pedir datos personales.
 *
 * httpOnly porque ningún script de la página necesita leerlo; sameSite=lax
 * porque un enlace compartido debe seguir funcionando al llegar desde fuera.
 */

export const SESSION_COOKIE = "uxa_session";
const MAX_AGE_DAYS = 30;

/** Formato exacto de lo que emitimos: rechaza cookies manipuladas a mano. */
const SESSION_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Lee la sesión de la petición, o null si no hay una válida. */
export function readSession(req: NextRequest): string | null {
  const value = req.cookies.get(SESSION_COOKIE)?.value;
  return value && SESSION_RE.test(value) ? value : null;
}

/** La sesión existente o una nueva. `isNew` decide si hay que emitir cookie. */
export function ensureSession(req: NextRequest): { sessionId: string; isNew: boolean } {
  const existing = readSession(req);
  if (existing) return { sessionId: existing, isNew: false };
  return { sessionId: randomUUID(), isNew: true };
}

export function attachSession<T extends NextResponse>(res: T, sessionId: string): T {
  res.cookies.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_DAYS * 86_400,
  });
  return res;
}

export function clearSession<T extends NextResponse>(res: T): T {
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
