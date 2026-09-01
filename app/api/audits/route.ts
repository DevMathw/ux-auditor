import { NextResponse, type NextRequest } from "next/server";
import { readSession } from "@/app/lib/session";
import { clearSession } from "@/app/lib/session";
import { getStore } from "@/app/lib/storage";

/**
 * Lo que el servidor guarda de esta sesión, y cómo borrarlo.
 *
 * Sin este par de verbos, guardar auditorías en el servidor sería recoger datos
 * sin dar forma de verlos ni de eliminarlos. Aquí no hace falta cuenta: la
 * cookie de sesión anónima es la única credencial, y quien no la trae no ve
 * nada de nadie.
 */
export const dynamic = "force-dynamic";

const MAX_ITEMS = 50;

export async function GET(req: NextRequest) {
  const sessionId = readSession(req);
  // Sin sesión no hay nada que enseñar, y no se crea una sólo por mirar.
  if (!sessionId) return NextResponse.json({ audits: [] }, { headers: NO_STORE });

  const store = await getStore();
  const audits = store.audits.listBySession(sessionId, MAX_ITEMS).map((a) => ({
    id: a.id,
    url: a.url,
    score: a.score,
    language: a.language,
    createdAt: a.createdAt,
    shareId: a.shareId,
  }));

  // Sólo los metadatos: el informe completo se pide por su id o su enlace.
  return NextResponse.json(
    { audits, storage: store.kind, count: audits.length },
    { headers: NO_STORE }
  );
}

/** Borrado total de lo guardado por esta sesión, y de la propia sesión. */
export async function DELETE(req: NextRequest) {
  const sessionId = readSession(req);
  if (!sessionId) return NextResponse.json({ deleted: 0 }, { headers: NO_STORE });

  const store = await getStore();
  const deleted = store.audits.deleteSession(sessionId);
  return clearSession(NextResponse.json({ deleted }, { headers: NO_STORE }));
}

const NO_STORE = { "Cache-Control": "no-store" };
