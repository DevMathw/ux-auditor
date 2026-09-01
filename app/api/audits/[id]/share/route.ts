import { NextResponse, type NextRequest } from "next/server";
import { readSession } from "@/app/lib/session";
import { getStore } from "@/app/lib/storage";

/**
 * Publicar o despublicar una auditoría.
 *
 * El enlace usa un identificador distinto del id interno: así compartir un
 * informe no revela un id que sirva para nada más, y despublicar invalida el
 * enlace sin tocar la auditoría.
 *
 * Sólo el dueño de la sesión puede compartir lo suyo. Un id ajeno responde 404,
 * no 403: confirmar que existe ya sería filtrar algo.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(req: NextRequest, ctx: RouteContext<"/api/audits/[id]/share">) {
  const sessionId = readSession(req);
  if (!sessionId) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { id } = await ctx.params;
  const store = await getStore();
  const shareId = store.audits.share(id, sessionId);
  if (!shareId) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ shareId, path: `/a/${shareId}` }, { headers: NO_STORE });
}

export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/audits/[id]/share">) {
  const sessionId = readSession(req);
  if (!sessionId) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { id } = await ctx.params;
  const store = await getStore();
  if (!store.audits.unshare(id, sessionId)) 
  {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ shared: false }, { headers: NO_STORE });
}
