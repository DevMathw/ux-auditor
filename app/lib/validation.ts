import type { AuditChecks } from "./types";

/** Longitud máxima de la URL que aceptamos analizar. */
export const MAX_URL_LENGTH = 2048;
/** Longitud máxima de cada campo de texto que se reenvía al modelo. */
export const MAX_TEXT_FIELD = 500;

export type Language = "en" | "es";

export function parseLanguage(value: unknown): Language {
  return value === "es" ? "es" : "en";
}

/** Recorta y limpia un texto que va a acabar dentro de un prompt. */
export function safeText(value: unknown, max = MAX_TEXT_FIELD): string {
  if (typeof value !== "string") return "";
  // Fuera caracteres de control: no aportan nada y ensucian el prompt.
  return value.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, max);
}

export function parseChecks(value: unknown): AuditChecks {
  const raw = (value ?? {}) as Partial<Record<keyof AuditChecks, unknown>>;
  const checks: AuditChecks = {
    accessibility: raw.accessibility !== false,
    visualHierarchy: raw.visualHierarchy !== false,
    uxClarity: raw.uxClarity !== false,
  };
  // Al menos un área tiene que estar activa o el informe no tendría sentido.
  if (!checks.accessibility && !checks.visualHierarchy && !checks.uxClarity) {
    return { accessibility: true, visualHierarchy: true, uxClarity: true };
  }
  return checks;
}

export type UrlParseResult =
  | { ok: true; url: URL }
  | { ok: false; error: "missing" | "too_long" | "malformed" | "protocol" };

export function parseTargetUrl(value: unknown): UrlParseResult {
  if (typeof value !== "string" || !value.trim()) return { ok: false, error: "missing" };
  if (value.length > MAX_URL_LENGTH) return { ok: false, error: "too_long" };

  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return { ok: false, error: "malformed" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "protocol" };
  }
  return { ok: true, url };
}
