import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_QUOTA, QUOTA_WINDOW_MS } from "@/app/lib/apiKeys";
import { denyOperator } from "@/app/lib/operatorAuth";
import { getStore } from "@/app/lib/storage";

/**
 * Gestión de claves de API. Detrás de ADMIN_TOKEN.
 *
 * Al crear una clave, el secreto se devuelve UNA vez y no vuelve a existir en
 * ningún sitio: sólo se guarda su SHA-256. Si se pierde, se revoca y se crea
 * otra. Es más incómodo y es lo correcto.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const MAX_QUOTA = 10_000;

export async function GET(req: NextRequest) {
  const denied = denyOperator(req);
  if (denied) return denied;

  const store = await getStore();
  return NextResponse.json(
    {
      keys: store.apiKeys.list().map(publicView),
      storage: store.kind,
      quotaWindowHours: QUOTA_WINDOW_MS / 3_600_000,
    },
    { headers: NO_STORE }
  );
}

export async function POST(req: NextRequest) {
  const denied = denyOperator(req);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const input = (body ?? {}) as Record<string, unknown>;

  const label = typeof input.label === "string" ? input.label.trim().slice(0, 60) : "";
  if (!label) return NextResponse.json({ error: "invalid_label" }, { status: 400 });

  const requested = Number(input.quota);
  const quota =
    Number.isFinite(requested) && requested > 0
      ? Math.min(MAX_QUOTA, Math.floor(requested))
      : DEFAULT_QUOTA;

  const store = await getStore();
  const { record, secret } = store.apiKeys.create(label, quota);

  return NextResponse.json(
    {
      key: publicView(record),
      // La única vez que este valor existe fuera de la memoria del proceso.
      secret,
      warning: "Store this now. It is hashed and cannot be recovered.",
    },
    { status: 201, headers: NO_STORE }
  );
}

/** Nunca incluye el hash: no hace falta para operar y sí sirve para atacar. */
function publicView(record: {
  id: string;
  label: string;
  createdAt: string;
  revokedAt: string | null;
  quota: number;
  used: number;
  windowStartedAt: string;
}) {
  return {
    id: record.id,
    label: record.label,
    createdAt: record.createdAt,
    revokedAt: record.revokedAt,
    quota: record.quota,
    used: record.used,
    remaining: Math.max(0, record.quota - record.used),
    windowStartedAt: record.windowStartedAt,
  };
}
