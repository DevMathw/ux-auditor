import { NextRequest, NextResponse } from "next/server";
import { denyOperator } from "@/app/lib/operatorAuth";
import { getUsageReport } from "@/app/lib/usage";

/**
 * Coste de operar la capa de IA en esta instancia.
 *
 * Responde a "¿cuánto cuesta tener esto en marcha?" con números medidos.
 * No es un dashboard: son totales acumulados desde que arrancó el proceso.
 *
 * Va detrás de ADMIN_TOKEN porque el volumen de auditorías y el gasto son
 * información de negocio, no algo que deba poder leer cualquiera. Comparte
 * token con /api/keys y /api/errors: es el mismo privilegio — quien opera el
 * despliegue — y tres secretos para un privilegio sólo multiplican los sitios
 * donde equivocarse.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = denyOperator(req);
  if (denied) return denied;

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
