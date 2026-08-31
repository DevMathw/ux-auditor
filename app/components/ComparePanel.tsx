"use client";

import { useMemo, useState } from "react";
import { compareAudits, comparableGroups } from "@/app/lib/compare";
import { getScoreColor } from "@/app/lib/score";
import { LOCALES, t as translate, type Language } from "@/app/lib/i18n";
import type { HistoryEntry } from "@/app/lib/types";

interface Props {
  history: HistoryEntry[];
  language: Language;
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="delta-chip delta-flat">—</span>;
  if (delta === 0) return <span className="delta-chip delta-flat">0</span>;
  return (
    <span className={`delta-chip ${delta > 0 ? "delta-up" : "delta-down"}`}>
      {delta > 0 ? "+" : ""}
      {delta}
    </span>
  );
}

/**
 * Comparación antes/después.
 *
 * Sólo aparece cuando el historial tiene la misma URL auditada dos o más veces.
 * Es la funcionalidad que sólo es posible porque la puntuación es determinista:
 * con un score generado por un modelo, un delta de 5 puntos no distinguiría una
 * mejora real del ruido entre ejecuciones.
 */
export default function ComparePanel({ history, language }: Props) {
  const t = translate(language);
  const groups = useMemo(() => comparableGroups(history), [history]);
  const urls = useMemo(() => [...groups.keys()], [groups]);
  const [url, setUrl] = useState<string | null>(null);

  if (urls.length === 0) return null;

  const selectedUrl = url && groups.has(url) ? url : urls[0];
  const entries = groups.get(selectedUrl)!;
  const before = entries[0];
  const after = entries[entries.length - 1];
  const comparison = compareAudits(before.audit, after.audit);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(LOCALES[language], {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  return (
    <div className="section-card compare-card">
      <div className="section-title">
        <span className="section-badge badge-info">{entries.length}</span>
        {t.compareTitle}
      </div>

      {urls.length > 1 && (
        <label className="compare-picker">
          <span className="sr-only">{t.compareChooseUrl}</span>
          <select value={selectedUrl} onChange={(e) => setUrl(e.target.value)}>
            {urls.map((u) => (
              <option key={u} value={u}>
                {u.replace(/^https?:\/\//, "")}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="compare-scores">
        <div className="compare-side">
          <div className="compare-label">{t.compareBefore}</div>
          <div className="compare-score" style={{ color: getScoreColor(before.audit.overallScore) }}>
            {before.audit.overallScore}
          </div>
          <div className="compare-date">{fmt(before.date)}</div>
          <div className="compare-checks">{comparison.checks.before}</div>
        </div>

        <div className="compare-arrow" aria-hidden="true">→</div>

        <div className="compare-side">
          <div className="compare-label">{t.compareAfter}</div>
          <div className="compare-score" style={{ color: getScoreColor(after.audit.overallScore) }}>
            {after.audit.overallScore}
          </div>
          <div className="compare-date">{fmt(after.date)}</div>
          <div className="compare-checks">{comparison.checks.after}</div>
        </div>

        <div className="compare-delta">
          <DeltaBadge delta={comparison.overall.delta} />
        </div>
      </div>

      <div className="compare-categories">
        {(
          [
            ["accessibility", comparison.categories.accessibility],
            ["visualHierarchy", comparison.categories.visualHierarchy],
            ["uxClarity", comparison.categories.uxClarity],
          ] as const
        ).map(([key, d]) => (
          <div key={key} className="compare-cat">
            <span className="compare-cat-name">{t.scoreLabels[key]}</span>
            <span className="compare-cat-nums">
              {d.before ?? "—"} → {d.after ?? "—"}
            </span>
            <DeltaBadge delta={d.delta} />
          </div>
        ))}
      </div>

      {comparison.caveat === "different_coverage" && (
        <p className="notice notice-warn">{t.compareCoverageCaveat}</p>
      )}

      <div className="compare-changes">
        <div className="compare-group">
          <h3 className="compare-group-title compare-fixed">
            {t.compareFixed} <span>{comparison.fixed.length}</span>
          </h3>
          {comparison.fixed.length > 0 ? (
            <ul className="compare-list">
              {comparison.fixed.map((f) => (
                <li key={f.id}>{f.title}</li>
              ))}
            </ul>
          ) : (
            <p className="compare-empty">{t.compareNone}</p>
          )}
        </div>

        <div className="compare-group">
          <h3 className="compare-group-title compare-new">
            {t.compareIntroduced} <span>{comparison.introduced.length}</span>
          </h3>
          {comparison.introduced.length > 0 ? (
            <ul className="compare-list">
              {comparison.introduced.map((f) => (
                <li key={f.id}>{f.title}</li>
              ))}
            </ul>
          ) : (
            <p className="compare-empty">{t.compareNone}</p>
          )}
        </div>

        <div className="compare-group">
          <h3 className="compare-group-title">
            {t.compareUnchanged} <span>{comparison.unchanged.length}</span>
          </h3>
          <p className="compare-empty">{t.compareUnchangedHint}</p>
        </div>
      </div>

      <p className="compare-footnote">{t.compareDeterministicNote}</p>
    </div>
  );
}
