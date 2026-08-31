"use client";

import { t as translate, type Language } from "@/app/lib/i18n";

interface Props {
  quickWins?: string;
  strengths?: string;
  language: Language;
}

export default function SummaryCards({ quickWins, strengths, language }: Props) {
  if (!quickWins?.trim() && !strengths?.trim()) return null;

  const t = translate(language);

  return (
    <div className="sections-grid">
      {quickWins && (
        <div className="section-card">
          <div className="section-title">
            <span className="section-badge badge-warn">!</span> {t.quickWins}
          </div>
          <p className="prose-block">{quickWins}</p>
        </div>
      )}
      {strengths && (
        <div className="section-card">
          <div className="section-title">
            <span className="section-badge badge-success">✓</span> {t.strengths}
          </div>
          <p className="prose-block">{strengths}</p>
        </div>
      )}
    </div>
  );
}
