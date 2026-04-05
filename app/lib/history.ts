import type { HistoryEntry } from "./types";

const STORAGE_KEY = "ux-auditor-history";

export function getHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveToHistory(entry: HistoryEntry): void {
  if (typeof window === "undefined") return;
  try {
    const history = getHistory();
    // Keep max 20 entries, newest first
    const updated = [entry, ...history].slice(0, 20);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // localStorage might be full, ignore
  }
}

export function clearHistory(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

export function deleteHistoryEntry(id: string): void {
  if (typeof window === "undefined") return;
  const history = getHistory().filter((e) => e.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}