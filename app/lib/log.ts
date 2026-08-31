/**
 * Logging estructurado.
 *
 * `console.error(err)` en una función serverless produce una línea que nadie
 * puede filtrar ni agregar. Esto emite JSON en una sola línea, que es lo que
 * cualquier recolector (Vercel, CloudWatch, Datadog) sabe indexar.
 *
 * Regla dura: aquí NUNCA entra una URL completa ni una credencial. Una URL
 * auditada puede llevar tokens en la query, y un log es un sitio del que es muy
 * difícil borrar datos después.
 */

type Level = "info" | "warn" | "error";

export interface LogFields {
  /** Qué ocurrió, en snake_case y estable — es lo que se agrega. */
  event: string;
  /** Sólo el host del objetivo, nunca la URL completa. */
  host?: string;
  durationMs?: number;
  [key: string]: unknown;
}

/** Extrae el host de una URL. Nunca devuelve path ni query. */
export function safeHost(url: string | URL): string {
  try {
    return new URL(String(url)).hostname;
  } catch {
    return "invalid";
  }
}

const REDACTED = "[redacted]";
/** Claves que jamás deben salir en un log, aunque alguien las pase por error. */
const FORBIDDEN = /key|token|secret|password|authorization|cookie/i;

function sanitise(fields: LogFields): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (FORBIDDEN.test(key)) {
      out[key] = REDACTED;
      continue;
    }
    // Una URL completa colada en un campo suelto se reduce a su host.
    if (typeof value === "string" && /^https?:\/\//i.test(value)) {
      out[key] = safeHost(value);
      continue;
    }
    out[key] = value;
  }
  return out;
}

function emit(level: Level, fields: LogFields): void {
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    ...sanitise(fields),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (fields: LogFields) => emit("info", fields),
  warn: (fields: LogFields) => emit("warn", fields),
  /** El error se reduce a nombre y mensaje: un stack completo puede llevar rutas. */
  error: (fields: LogFields & { error?: unknown }) => {
    const { error, ...rest } = fields;
    emit("error", {
      ...rest,
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
    });
  },
};
