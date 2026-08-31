import { NextRequest, NextResponse } from "next/server";
import { getUsageReport } from "@/app/lib/usage";

/**
 * Coste de operar la capa de IA en esta instancia.
 *
 * Responde a "¿cuánto cuesta tener esto en marcha?" con números medidos.
 * No es un dashboard: son totales acumulados desde que arrancó el proceso.
 *
 * Va detrás de un token porque el volumen de auditorías y el gasto son
 * información de negocio, no algo que deba poder leer cualquiera. Sin
 * USAGE_TOKEN configurado el endpoint devuelve 404 — mejor no existir que
 * existir abierto por olvido.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const expected = process.env.USAGE_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const report = getUsageReport();

  return NextResponse.json(
    {
      ...report,
      // Se expone el precio usado para que el coste sea auditable, no un número
      // que hay que creerse.
      pricing: { model: "claude-sonnet-5", inputPerMTok: 2.0, outputPerMTok: 10.0 },
      note: "Totals since this instance started. In-memory, so they reset on deploy.",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
