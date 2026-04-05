"use client";

interface Props {
  quickWins?: string;
  strengths?: string;
  language: "en" | "es";
}

export default function SummaryCards({ quickWins, strengths, language }: Props) {
  if (!quickWins && !strengths) return null;

  const t = {
    quickWins: language === "es" ? "Victorias Rápidas" : "Quick Wins",
    strengths: language === "es" ? "Fortalezas" : "Strengths",
  };

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