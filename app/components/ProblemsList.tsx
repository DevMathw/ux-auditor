"use client";

import { useState } from "react";
import type { AuditProblem } from "@/app/lib/types";
import ExplainModal from "./ExplainModal";

interface Props {
  problems: AuditProblem[];
  language: "en" | "es";
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

export default function ProblemsList({ problems, language }: Props) {
  const [resolved, setResolved] = useState<Set<number>>(new Set());
  const [explaining, setExplaining] = useState<AuditProblem | null>(null);

  const toggle = (i: number) =>
    setResolved((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  const t = {
    title: language === "es" ? "Problemas Encontrados" : "Problems Found",
    resolved: language === "es" ? "resuelto" : "resolved",
    explain: language === "es" ? "Explícame esto" : "Explain this",
    markResolved: language === "es" ? "Marcar resuelto" : "Mark resolved",
  };

  return (
    <>
      <div className="section-card">
        <div className="section-title">
          <span className="section-badge badge-danger">{problems.length}</span>
          {t.title}
        </div>
        <ul className="issue-list">
          {problems.map((p, i) => (
            <li
              key={i}
              className="issue-item"
              style={{ opacity: resolved.has(i) ? 0.45 : 1, transition: "opacity 0.2s" }}
            >
              <span className={`issue-dot ${dotClass[p.severity] ?? "dot-warn"}`} />
              <div style={{ flex: 1 }}>
                <span className={`issue-tag ${categoryClass[p.category] ?? "tag-clarity"}`}>
                  {p.category}
                </span>
                <div style={{
                  fontWeight: 500, fontSize: "13.5px",
                  textDecoration: resolved.has(i) ? "line-through" : "none",
                }}>
                  {p.title}
                </div>
                <div style={{ fontSize: "12.5px", color: "var(--muted)", marginTop: "2px" }}>
                  {p.description}
                </div>
                <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
                  <button
                    onClick={() => setExplaining(p)}
                    style={{
                      background: "none", border: "1px solid var(--border2)", borderRadius: "6px",
                      padding: "2px 8px", fontSize: "11px", fontFamily: "var(--font-mono)",
                      cursor: "pointer", color: "var(--muted)", transition: "all 0.15s",
                    }}
                  >
                    ✦ {t.explain}
                  </button>
                  <button
                    onClick={() => toggle(i)}
                    style={{
                      background: resolved.has(i) ? "var(--accent-bg)" : "none",
                      border: "1px solid var(--border2)", borderRadius: "6px",
                      padding: "2px 8px", fontSize: "11px", fontFamily: "var(--font-mono)",
                      cursor: "pointer",
                      color: resolved.has(i) ? "var(--accent-muted)" : "var(--muted)",
                      transition: "all 0.15s",
                    }}
                  >
                    {resolved.has(i) ? `✓ ${t.resolved}` : `○ ${t.markResolved}`}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {explaining && (
        <ExplainModal
          problem={explaining}
          language={language}
          onClose={() => setExplaining(null)}
        />
      )}
    </>
  );
}