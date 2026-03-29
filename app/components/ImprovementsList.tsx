"use client";

import type { AuditImprovement } from "@/app/lib/types";

interface Props {
  improvements: AuditImprovement[];
}

const impactClass: Record<string, string> = {
  high: "impact-high",
  medium: "impact-med",
  low: "impact-low",
};

export default function ImprovementsList({ improvements }: Props) {
  return (
    <div className="section-card">
      <div className="section-title">
        <span className="section-badge badge-success">{improvements.length}</span>
        Improvements
      </div>
      {improvements.map((imp, i) => (
        <div key={i} className="priority-item">
          <div className="priority-num">{i + 1}</div>
          <div className="priority-content">
            <div className="priority-title">{imp.title}</div>
            <div className="priority-desc">{imp.description}</div>
          </div>
          <span className={`priority-impact ${impactClass[imp.impact] ?? "impact-med"}`}>
            {imp.impact} impact
          </span>
        </div>
      ))}
    </div>
  );
}