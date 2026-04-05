"use client";

import { useState, useEffect } from "react";
import type { AuditProblem } from "@/app/lib/types";

interface Props {
  problem: AuditProblem | null;
  language: "en" | "es";
  onClose: () => void;
}

const categoryColors: Record<string, string> = {
  accessibility: "var(--warn)",
  hierarchy: "var(--info)",
  clarity: "var(--accent-muted)",
  performance: "var(--danger)",
};

export default function ExplainModal({ problem, language, onClose }: Props) {
  const [explanation, setExplanation] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!problem) return;
    setExplanation("");
    setLoading(true);

    fetch("/api/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: problem.title,
        description: problem.description,
        category: problem.category,
        severity: problem.severity,
        language,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        setExplanation(
          data.explanation ||
            (language === "es"
              ? "No se pudo cargar la explicación."
              : "Could not load explanation.")
        );
      })
      .catch(() => {
        setExplanation(
          language === "es"
            ? "No se pudo cargar la explicación."
            : "Could not load explanation."
        );
      })
      .finally(() => setLoading(false));
  }, [problem, language]);

  if (!problem) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 50, padding: "1rem",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)", border: "1px solid var(--border2)",
          borderRadius: "16px", padding: "1.5rem",
          maxWidth: "480px", width: "100%",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
          <div>
            <span style={{
              display: "inline-block", fontSize: "10px", fontFamily: "var(--font-mono)",
              padding: "2px 8px", borderRadius: "4px", marginBottom: "6px",
              background: `color-mix(in srgb, ${categoryColors[problem.category] ?? "var(--muted)"} 15%, transparent)`,
              color: categoryColors[problem.category] ?? "var(--muted)",
            }}>
              {problem.category}
            </span>
            <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontSize: "1.1rem" }}>
              {problem.title}
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--muted)", fontSize: "20px", padding: "0 0 0 12px", lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "1rem", lineHeight: 1.6 }}>
          {problem.description}
        </p>

        <div style={{
          background: "var(--bg)", borderRadius: "10px", padding: "1rem",
          fontSize: "13.5px", lineHeight: 1.7, minHeight: "80px", color: "var(--text)",
        }}>
          {loading ? (
            <div style={{ color: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: "12px" }}>
              {language === "es" ? "Generando explicación…" : "Generating explanation…"}
            </div>
          ) : explanation}
        </div>

        <button
          onClick={onClose}
          style={{
            marginTop: "1rem", width: "100%", background: "var(--text)",
            color: "var(--bg)", border: "none", borderRadius: "10px",
            padding: "0.65rem", fontFamily: "var(--font-body)", fontSize: "14px",
            cursor: "pointer",
          }}
        >
          {language === "es" ? "Cerrar" : "Close"}
        </button>
      </div>
    </div>
  );
}