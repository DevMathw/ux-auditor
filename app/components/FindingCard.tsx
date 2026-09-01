"use client";

import { useState } from "react";
import type { AuditFinding } from "@/app/lib/types";
import { t as translate, type Language } from "@/app/lib/i18n";

interface Props {
  finding: AuditFinding;
  language: Language;
  resolved: boolean;
  onToggleResolved: () => void;
  onExplain: () => void;
}

const severityClass: Record<string, string> = {
  critical: "sev-critical",
  high: "sev-high",
  medium: "sev-medium",
  low: "sev-low",
};

export default function FindingCard({
  finding,
  language,
  resolved,
  onToggleResolved,
  onExplain,
}: Props) {
  const [open, setOpen] = useState(false);
  const t = translate(language);
  const isAI = finding.source === "ai";

  return (
    <article className={`finding ${severityClass[finding.severity] ?? "sev-medium"}`} data-resolved={resolved}>
      <div className="finding-head">
        <div className="finding-tags">
          <span className={`tag tag-sev-${finding.severity}`}>
            {t.severityLabels[finding.severity]}
          </span>
          <span className="tag tag-cat">{t.categoryLabels[finding.category] ?? finding.category}</span>
          <span className={`tag ${isAI ? "tag-ai" : "tag-verified"}`} title={isAI ? t.sourceAiHint : t.sourceRuleHint}>
            {isAI ? `✦ ${t.sourceAi}` : `✓ ${t.sourceRule}`}
          </span>
          {finding.wcag && (
            <span className="tag tag-wcag" title={`WCAG ${finding.wcag}`}>
              WCAG {finding.wcag}
            </span>
          )}
        </div>

        <h3 className="finding-title">{finding.title}</h3>
        <p className="finding-desc">{finding.description}</p>

        <div className="finding-meta">
          <span className="meta-chip">{t.impactLabels[finding.impact]}</span>
          <span className="meta-chip">{t.effortLabels[finding.effort]}</span>
        </div>
      </div>

      <div className="finding-actions">
        <button type="button" className="mini-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open} >
          {open ? "▾" : "▸"} {t.evidence} · {t.howToFix}
        </button>
        <button type="button" className="mini-btn" onClick={onExplain}>
          ✦ {t.explain}
        </button>
        <button type="button" className="mini-btn" onClick={onToggleResolved} aria-pressed={resolved} style={resolved ? { background: "var(--accent-bg)", color: "var(--accent-muted)" } : undefined} >
          {resolved ? `✓ ${t.resolved}` : `○ ${t.markResolved}`}
        </button>
      </div>

      {open && (
        <div className="finding-detail">
          {finding.evidence.length > 0 && (
            <div className="detail-block">
              <div className="detail-label">{t.evidence}</div>
              <ul className="evidence-list">
                {finding.evidence.map((e, i) => (
                  <li key={i}>
                    {e.selector && <code className="ev-selector">{e.selector}</code>}
                    {e.detail && <span className="ev-detail">{e.detail}</span>}
                    {e.snippet && <code className="ev-snippet">{e.snippet}</code>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {finding.fix && (
            <div className="detail-block">
              <div className="detail-label">{t.howToFix}</div>
              <p className="detail-fix">{finding.fix}</p>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
