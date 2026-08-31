"use client";

import { useMemo, useState } from "react";
import { isQuickWin, type AuditFinding, type Severity } from "@/app/lib/types";
import { t as translate, type Language } from "@/app/lib/i18n";
import FindingCard from "./FindingCard";
import ExplainModal from "./ExplainModal";

interface Props {
  findings: AuditFinding[];
  language: Language;
}

const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low"];

export default function FindingsList({ findings, language }: Props) {
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [explaining, setExplaining] = useState<AuditFinding | null>(null);
  const t = translate(language);

  const quickWins = useMemo(() => findings.filter(isQuickWin), [findings]);

  const grouped = useMemo(() => {
    const map = new Map<Severity, AuditFinding[]>();
    for (const severity of SEVERITY_ORDER) {
      const items = findings.filter((f) => f.severity === severity);
      if (items.length > 0) map.set(severity, items);
    }
    return map;
  }, [findings]);

  const toggle = (id: string) =>
    setResolved((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (findings.length === 0) {
    return (
      <div className="section-card">
        <div className="section-title">{t.findings}</div>
        <p className="prose-block">{t.noFindings}</p>
      </div>
    );
  }

  return (
    <>
      {quickWins.length > 0 && (
        <div className="section-card quickwins-card">
          <div className="section-title">
            <span className="section-badge badge-warn">{quickWins.length}</span>
            {t.quickWinsTitle}
          </div>
          <p className="quickwins-hint">{t.quickWinsHint}</p>
          <ol className="quickwins-list">
            {quickWins.map((f) => (
              <li key={f.id}>
                <strong>{f.title}</strong>
                {f.fix && <span className="quickwins-fix"> — {f.fix}</span>}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="section-card">
        <div className="section-title">
          <span className="section-badge badge-danger">{findings.length}</span>
          {t.findings}
        </div>

        {[...grouped.entries()].map(([severity, items]) => (
          <section key={severity} className="severity-group">
            <h3 className="severity-heading">
              <span className={`sev-dot sev-dot-${severity}`} aria-hidden="true" />
              {t.severityLabels[severity]}
              <span className="severity-count">{items.length}</span>
            </h3>
            <div className="finding-stack">
              {items.map((f) => (
                <FindingCard
                  key={f.id}
                  finding={f}
                  language={language}
                  resolved={resolved.has(f.id)}
                  onToggleResolved={() => toggle(f.id)}
                  onExplain={() => setExplaining(f)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {explaining && (
        <ExplainModal
          key={explaining.id}
          finding={explaining}
          language={language}
          onClose={() => setExplaining(null)}
        />
      )}
    </>
  );
}
