"use client";

import type { AuditProblem } from "@/app/lib/types";

interface Props {
  problems: AuditProblem[];
}

const categoryClass: Record<string, string> = {
  accessibility: "tag-accessibility",
  hierarchy: "tag-hierarchy",
  clarity: "tag-clarity",
  performance: "tag-performance",
};

const dotClass: Record<string, string> = {
  high: "dot-danger",
  medium: "dot-warn",
  low: "dot-info",
};

export default function ProblemsList({ problems }: Props) {
  return (
    <div className="section-card">
      <div className="section-title">
        <span className="section-badge badge-danger">{problems.length}</span>
        Problems Found
      </div>
      <ul className="issue-list">
        {problems.map((p, i) => (
          <li key={i} className="issue-item">
            <span className={`issue-dot ${dotClass[p.severity] ?? "dot-warn"}`} />
            <div>
              <span className={`issue-tag ${categoryClass[p.category] ?? "tag-clarity"}`}>
                {p.category}
              </span>
              <div className="font-medium text-[13.5px]">{p.title}</div>
              <div className="text-[12.5px] text-[var(--muted)] mt-0.5">
                {p.description}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}