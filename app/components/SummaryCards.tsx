"use client";

interface Props {
  quickWins?: string;
  strengths?: string;
}

export default function SummaryCards({ quickWins, strengths }: Props) {
  if (!quickWins && !strengths) return null;
  return (
    <div className="sections-grid">
      {quickWins && (
        <div className="section-card">
          <div className="section-title">
            <span className="section-badge badge-warn">!</span> Quick Wins
          </div>
          <p className="prose-block">{quickWins}</p>
        </div>
      )}
      {strengths && (
        <div className="section-card">
          <div className="section-title">
            <span className="section-badge badge-success">✓</span> Strengths
          </div>
          <p className="prose-block">{strengths}</p>
        </div>
      )}
    </div>
  );
}