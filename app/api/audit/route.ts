import { NextRequest, NextResponse } from "next/server";
import { runAudit, type AuditFailure } from "@/app/lib/runAudit";
import { log } from "@/app/lib/log";
import { clientKey, rateLimit } from "@/app/lib/rateLimit";
import { parseChecks, parseLanguage, parseTargetUrl } from "@/app/lib/validation";
import { authenticateKey, quotaResetSeconds } from "@/app/lib/apiKeys";
import { attachSession, ensureSession } from "@/app/lib/session";
import { getStore } from "@/app/lib/storage";
import type { AuditResult } from "@/app/lib/types";

/**
 * Capa HTTP. Su única responsabilidad es traducir entre la web y el dominio:
 * validar la entrada, aplicar el límite de peticiones, y convertir el resultado
 * de runAudit() en códigos de estado. Toda la orquestación vive en
 * app/lib/runAudit.ts, que se puede probar sin fabricar un NextRequest.
 */

export const maxDuration = 60;

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 5 * 60_000;
const MAX_BODY_BYTES = 8_000;

/** Una URL privada es entrada inválida; el resto son fallos del objetivo. */
const STATUS_BY_FAILURE: Record<AuditFailure, number> = {
  fetch_blocked: 400,
  fetch_unreachable: 422,
  fetch_not_html: 422,
  fetch_too_large: 422,
};

function fail(code: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: code, ...extra }, { status });
}

export async function POST(req: NextRequest) {
  // Una clave válida sustituye al límite por IP: la cuota de la clave pasa a
  // ser el límite. Sin clave, todo sigue funcionando exactamente como antes.
  const auth = await authenticateKey(req);
  if (auth.status === "invalid") return fail("invalid_api_key", 401);
  if (auth.status === "revoked") return fail("revoked_api_key", 401);
  if (auth.status === "quota_exceeded") {
    const retryAfter = quotaResetSeconds(auth.record);
    return NextResponse.json(
      { error: "quota_exceeded", quota: auth.record.quota, retryAfter },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  if (auth.status === "anonymous") {
    const limit = rateLimit(clientKey(req), RATE_LIMIT, RATE_WINDOW_MS);
    if (!limit.ok) {
      return NextResponse.json(
        { error: "rate_limited", retryAfter: limit.retryAfter },
        { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
      );
    }
  }

  const contentLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return fail("payload_too_large", 413);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("invalid_body", 400);
  }

  const input = (body ?? {}) as Record<string, unknown>;
  const language = parseLanguage(input.language);
  const parsed = parseTargetUrl(input.url);
  if (!parsed.ok) {
    return fail(parsed.error === "protocol" ? "invalid_protocol" : "invalid_url", 400);
  }

  try {
    const outcome = await runAudit({
      url: parsed.url,
      checks: parseChecks(input.checks),
      language,
      ai: input.ai !== false,
      visual: input.visual !== false,
    });

    if (!outcome.ok) return fail(outcome.reason, STATUS_BY_FAILURE[outcome.reason]);

    const { sessionId, isNew } = ensureSession(req);
    const stored = await persist(sessionId, outcome.analyzedUrl, language, outcome.audit);

    const res = NextResponse.json({
      audit: outcome.audit,
      analyzedUrl: outcome.analyzedUrl,
      cached: outcome.cached,
      // null si el guardado falló: el informe se entrega igual, pero el cliente
      // sabe que no podrá compartirlo.
      auditId: stored,
    });
    return isNew ? attachSession(res, sessionId) : res;
  } catch (err) {
    // runAudit degrada por su cuenta ante fallos de IA o renderizado; llegar
    // aquí significa un error inesperado, que no debe exponerse al cliente.
    log.error({ event: "audit_unexpected_error", error: err });
    await recordError("audit_unexpected_error", err);
    return fail("analysis_failed", 500);
  }
}

/**
 * Guarda la auditoría y devuelve su id, o null si el store no pudo.
 *
 * Envuelto porque persistir es accesorio: el informe ya está calculado y
 * pagado, y perderlo por un fallo de escritura sería lo peor de los dos mundos.
 */
async function persist(
  sessionId: string,
  url: string,
  language: "en" | "es",
  audit: AuditResult
): Promise<string | null> {
  try {
    const store = await getStore();
    const record = store.audits.save({
      sessionId,
      url,
      score: audit.overallScore,
      language,
      createdAt: new Date().toISOString(),
      audit,
    });
    return record.id;
  } catch (err) {
    log.error({ event: "audit_persist_failed", error: err });
    return null;
  }
}

/** El almacén de errores no debe poder provocar un error él mismo. */
async function recordError(event: string, err: unknown): Promise<void> {
  try {
    const store = await getStore();
    store.errors.record(event, err instanceof Error ? err.message : String(err));
  } catch {
    // Si ni siquiera se puede registrar el error, no queda nada útil que hacer.
  }
}
