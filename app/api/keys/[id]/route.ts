import { NextResponse, type NextRequest } from "next/server";
import { denyOperator } from "@/app/lib/operatorAuth";
import { getStore } from "@/app/lib/storage";

/**
 * Revocación de una clave.
 *
 * Se marca revocada en vez de borrarla: la fila es el registro de que esa clave
 * existió y cuánto se usó. Un borrado dejaría un agujero en la historia.
 */
export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/keys/[id]">) {
  const denied = denyOperator(req);
  if (denied) return denied;

  const { id } = await ctx.params;
  const store = await getStore();
  if (!store.apiKeys.revoke(id)) 
  {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ revoked: true }, { headers: { "Cache-Control": "no-store" } });
}
