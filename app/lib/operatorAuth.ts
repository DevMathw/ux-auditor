import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Puerta de los endpoints de operación (uso, claves y errores).
 *
 * Un único ADMIN_TOKEN para los tres: son la misma clase de acceso — el que
 * opera el despliegue — y tres secretos distintos para el mismo privilegio no
 * dan más seguridad, sólo más sitios donde equivocarse.
 *
 * Sin ADMIN_TOKEN configurado, los endpoints devuelven 404: un endpoint que no
 * existe es más seguro que uno abierto por olvido.
 */

/** Comparación en tiempo constante: un `!==` filtra el prefijo correcto. */
function tokensMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual exige longitudes iguales, y la propia excepción filtraría
  // la longitud del secreto. Se compara contra sí mismo para tardar lo mismo.
  if (a.length !== b.length) return timingSafeEqual(b, b) && false;
  return timingSafeEqual(a, b);
}

/** null si la petición está autorizada; si no, la respuesta a devolver. */
export function denyOperator(req: NextRequest): NextResponse | null {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!tokensMatch(provided, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
