import { NextRequest, NextResponse } from "next/server";
import { runAudit, type AuditFailure } from "@/app/lib/runAudit";
import { log } from "@/app/lib/log";
import { clientKey, rateLimit } from "@/app/lib/rateLimit";
import { parseChecks, parseLanguage, parseTargetUrl } from "@/app/lib/validation";

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
  const limit = rateLimit(clientKey(req), RATE_LIMIT, RATE_WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "rate_limited", retryAfter: limit.retryAfter },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
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
  const parsed = parseTargetUrl(input.url);
  if (!parsed.ok) {
    return fail(parsed.error === "protocol" ? "invalid_protocol" : "invalid_url", 400);
  }

  try {
    const outcome = await runAudit({
      url: parsed.url,
      checks: parseChecks(input.checks),
      language: parseLanguage(input.language),
      ai: input.ai !== false,
      visual: input.visual !== false,
    });

    if (!outcome.ok) return fail(outcome.reason, STATUS_BY_FAILURE[outcome.reason]);

    return NextResponse.json({
      audit: outcome.audit,
      analyzedUrl: outcome.analyzedUrl,
      cached: outcome.cached,
    });
  } catch (err) {
    // runAudit degrada por su cuenta ante fallos de IA o renderizado; llegar
    // aquí significa un error inesperado, que no debe exponerse al cliente.
    log.error({ event: "audit_unexpected_error", error: err });
    return fail("analysis_failed", 500);
  }
}
