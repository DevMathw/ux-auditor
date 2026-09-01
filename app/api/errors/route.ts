import { NextResponse, type NextRequest } from "next/server";
import { denyOperator } from "@/app/lib/operatorAuth";
import { getStore } from "@/app/lib/storage";

/**
 * Los últimos errores del servidor. Detrás de ADMIN_TOKEN.
 *
 * Es observabilidad mínima y honesta: un anillo de los 100 últimos errores, sin
 * agregación ni alertas. No pretende ser Sentry — pretende que, cuando algo
 * falla en el despliegue, se pueda ver qué sin entrar por SSH.
 *
 * Guarda el mensaje del error, no la petición: ni URL de usuario, ni IP, ni
 * cabeceras. Un almacén de errores es justo donde los datos personales acaban
 * filtrándose sin querer.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest) {
  const denied = denyOperator(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const requested = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(requested) && requested > 0 ? Math.min(100, requested) : 50;

  const store = await getStore();
  const errors = store.errors.recent(limit);
  return NextResponse.json(
    { errors, count: errors.length, storage: store.kind },
    { headers: NO_STORE }
  );
}

export async function DELETE(req: NextRequest) {
  const denied = denyOperator(req);
  if (denied) return denied;

  const store = await getStore();
  store.errors.clear();
  return NextResponse.json({ cleared: true }, { headers: NO_STORE });
}
