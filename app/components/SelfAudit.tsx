"use client";

import { useState } from "react";
import selfAudit from "@/app/lib/self-audit.json";
import { getScoreColor } from "@/app/lib/score";
import { LOCALES, t as translate, type Language } from "@/app/lib/i18n";
import type { AuditResult } from "@/app/lib/types";

interface Props {
  language: Language;
}

/**
 * "UX Auditor audits itself".
 *
 * Los datos vienen de `scripts/self-audit.mts`, que corre el motor real contra
 * el build de producción y escribe el resultado. NO es una auditoría en vivo, y
 * el componente lo dice: muestra la fecha de generación y cómo se produjo.
 *
 * No se audita en vivo por dos razones: el guard SSRF bloquea 127.0.0.1 a
 * propósito, así que la app no puede auditarse a sí misma por su propia API sin
 * abrir un agujero; y hacerlo por visitante costaría una llamada al modelo cada
 * vez.
 */
const report = selfAudit as { generatedAt: string; target: string; audit: AuditResult };

export default function SelfAudit({ language }: Props) {
  const [open, setOpen] = useState(false);
  const t = translate(language);
  const { audit } = report;

  const date = new Date(report.generatedAt).toLocaleDateString(LOCALES[language], {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const ruleFindings = audit.findings.filter((f) => f.source === "rule");
  const aiFindings = audit.findings.filter((f) => f.source === "ai");

  return (
    <section className="section-card self-audit">
      <div className="section-title">
        <span className="section-badge badge-success">✓</span>
        {t.selfAuditTitle}
      </div>

      <p className="self-audit-lead">{t.selfAuditLead}</p>

      <div className="self-audit-scores">
        <div className="self-audit-overall">
          <span className="self-audit-score" style={{ color: getScoreColor(audit.overallScore) }}>
            {audit.overallScore}
          </span>
          <span className="self-audit-outof">/ 100</span>
        </div>
        <div className="self-audit-meta">
          <div className="self-audit-checks">
            {t.checksPassed(audit.checksPassed, audit.checksApplicable)}
          </div>
          <div className="self-audit-cats">
            {(
              [
                ["accessibility", audit.scoreBreakdown.accessibility],
                ["visualHierarchy", audit.scoreBreakdown.visualHierarchy],
                ["uxClarity", audit.scoreBreakdown.uxClarity],
              ] as const
            )
              .filter(([, v]) => v !== null)
              .map(([key, value]) => (
                <span key={key} className="self-audit-cat">
                  {t.scoreLabels[key]}{" "}
                  <b style={{ color: getScoreColor(value!.score) }}>{value!.score}</b>
                </span>
              ))}
          </div>
        </div>
      </div>

      {audit.summary && <p className="self-audit-summary">{audit.summary}</p>}

      <button type="button" className="mini-btn self-audit-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {open ? "▾" : "▸"} {t.selfAuditShowFindings} ({audit.findings.length})
      </button>

      {open && (
        <div className="self-audit-findings">
          {ruleFindings.length > 0 && (
            <ul className="self-audit-list">
              {ruleFindings.map((f) => (
                <li key={f.id}>
                  <span className="tag tag-verified">✓ {t.sourceRule}</span> {f.title}
                </li>
              ))}
            </ul>
          )}
          {aiFindings.length > 0 && (
            <ul className="self-audit-list">
              {aiFindings.map((f) => (
                <li key={f.id}>
                  <span className="tag tag-ai">✦ {t.sourceAi}</span> {f.title}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* La honestidad sobre la procedencia del dato es parte del argumento. */}
      <p className="self-audit-provenance">
        {t.selfAuditProvenance(date)}
        {!audit.rendered && ` ${t.selfAuditNoRender}`}
      </p>
    </section>
  );
}
