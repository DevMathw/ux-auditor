import type { HistoryEntry } from "./types";
import { normalizeAudit } from "./auditSchema";
import { isLanguage, type Language } from "./i18n";

const STORAGE_KEY = "ux-auditor-history";
const LANGUAGE_KEY = "ux-auditor-language";
const MAX_ENTRIES = 20;

/**
 * localStorage puede contener datos de una versión anterior de la app, o
 * simplemente corruptos. Se valida entrada por entrada y se descarta lo que no
 * encaje, en vez de dejar que reviente al renderizar.
 */
function parseEntry(value: unknown): HistoryEntry | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;

  if (typeof raw.id !== "string" || typeof raw.url !== "string") return null;
  if (typeof raw.date !== "string" || Number.isNaN(Date.parse(raw.date))) return null;

  const audit = normalizeAudit(raw.audit);
  if (!audit) return null;

  const score = Number(raw.score);

  return {
    id: raw.id,
    url: raw.url,
    score: Number.isFinite(score) ? Math.min(100, Math.max(0, Math.round(score))) : audit.overallScore,
    date: raw.date,
    language: isLanguage(raw.language) ? raw.language : "en",
    audit,
  };
}

export function getHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(parseEntry)
      .filter((entry): entry is HistoryEntry => entry !== null)
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

function write(entries: HistoryEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // localStorage lleno o deshabilitado: el historial es un extra, no bloquea nada.
  }
}

export function saveToHistory(entry: HistoryEntry): void {
  if (typeof window === "undefined") return;
  write([entry, ...getHistory()].slice(0, MAX_ENTRIES));
}

export function clearHistory(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // sin acceso a localStorage no hay nada que limpiar
  }
}

export function deleteHistoryEntry(id: string): void {
  if (typeof window === "undefined") return;
  write(getHistory().filter((e) => e.id !== id));
}

export function getStoredLanguage(): Language | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LANGUAGE_KEY);
    return isLanguage(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function storeLanguage(language: Language): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LANGUAGE_KEY, language);
  } catch {
    // preferencia no persistida: no es crítico
  }
}
