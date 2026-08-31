"use client";

import type { HistoryEntry } from "@/app/lib/types";
import { deleteHistoryEntry, clearHistory } from "@/app/lib/history";
import { getScoreColor } from "@/app/lib/score";
import { LOCALES, t as translate, type Language } from "@/app/lib/i18n";

interface Props {
  history: HistoryEntry[];
  language: Language;
  onSelect: (entry: HistoryEntry) => void;
  onHistoryChange: () => void;
}

export default function HistoryPanel({ history, language, onSelect, onHistoryChange }: Props) {
  const t = translate(language);

  if (history.length === 0) return null;

  return (
    <div className="section-card" style={{ marginBottom: "1.25rem" }}>
      <div className="section-title" style={{ justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span className="section-badge badge-info">{history.length}</span>
          {t.historyTitle}
        </div>
        <button
          onClick={() => { clearHistory(); onHistoryChange(); }}
          style={{
            background: "none", border: "none", cursor: "pointer",
            fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--muted)",
          }}
        >
          {t.clearAll}
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {history.map((entry) => (
          <div
            key={entry.id}
            style={{
              display: "flex", alignItems: "center", gap: "12px",
              padding: "0.65rem 0.75rem", background: "var(--bg)",
              borderRadius: "10px", border: "1px solid var(--border)",
            }}
          >
            <div
              style={{
                width: "36px", height: "36px", borderRadius: "50%",
                border: `2px solid ${getScoreColor(entry.score)}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 500,
                color: getScoreColor(entry.score), flexShrink: 0,
              }}
            >
              {entry.score}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: "13px", fontWeight: 500, overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {entry.url.replace(/^https?:\/\//, "")}
              </div>
              <div style={{ fontSize: "11px", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                {new Date(entry.date).toLocaleDateString(LOCALES[language], {
                  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                })}
              </div>
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                onClick={() => onSelect(entry)}
                style={{
                  background: "var(--text)", color: "var(--bg)", border: "none",
                  borderRadius: "6px", padding: "4px 10px", fontSize: "11px",
                  fontFamily: "var(--font-mono)", cursor: "pointer",
                }}
              >
                {t.load}
              </button>
              <button
                onClick={() => { deleteHistoryEntry(entry.id); onHistoryChange(); }}
                aria-label={`${t.deleteEntry}: ${entry.url}`}
                style={{
                  background: "none", border: "1px solid var(--border2)",
                  borderRadius: "6px", padding: "4px 8px", fontSize: "11px",
                  color: "var(--muted)", cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
