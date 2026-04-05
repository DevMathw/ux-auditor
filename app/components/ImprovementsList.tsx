"use client";

import type { AuditImprovement } from "@/app/lib/types";

interface Props {
  improvements: AuditImprovement[];
  language: "en" | "es";
}

const impactClass: Record<string, string> = {
  high: "impact-high",
  medium: "impact-med",
  low: "impact-low",
};

const impactLabel = {
  en: { high: "high impact", medium: "medium impact", low: "low impact" },
  es: { high: "alto impacto", medium: "impacto medio", low: "bajo impacto" },
};

export default function ImprovementsList({ improvements, language }: Props) {
  const t = {
    title: language === "es" ? "Mejoras" : "Improvements",
  };

  return (
    <div className="section-card">
      <div className="section-title">
        <span className="section-badge badge-success">{improvements.length}</span>
        {t.title}
      </div>
      {improvements.map((imp, i) => (
        <div key={i} className="priority-item">
          <div className="priority-num">{i + 1}</div>
          <div className="priority-content">
            <div className="priority-title">{imp.title}</div>
            <div className="priority-desc">{imp.description}</div>
          </div>
          <span className={`priority-impact ${impactClass[imp.impact] ?? "impact-med"}`}>
            {impactLabel[language][imp.impact]}
          </span>
        </div>
      ))}
    </div>
  );
}