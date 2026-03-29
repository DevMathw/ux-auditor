"use client";

import { useState } from "react";
import AuditForm from "./components/AuditForm";
import LoadingState from "./components/LoadingState";
import ScoreRing from "./components/ScoreRing";
import ProblemsList from "./components/ProblemsList";
import ImprovementsList from "./components/ImprovementsList";
import SummaryCards from "./components/SummaryCards";
import type { AuditChecks, AuditResult } from "./lib/types";

function getScoreColor(score: number) {
  if (score >= 70) return "#1D9E75";
  if (score >= 45) return "#BA7517";
  return "#A32D2D";
}

type AppState = "idle" | "loading" | "done" | "error";

export default function HomePage() {
  const [state, setState] = useState<AppState>("idle");
  const [loadingStep, setLoadingStep] = useState(0);
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [analyzedUrl, setAnalyzedUrl] = useState("");
  const [error, setError] = useState("");

  const runAudit = async (url: string, checks: AuditChecks) => {
    setState("loading");
    setLoadingStep(0);
    setError("");
    setAnalyzedUrl(url);

    try {
      setLoadingStep(0); // fetching
      await new Promise((r) => setTimeout(r, 600));
      setLoadingStep(1); // parsing
      await new Promise((r) => setTimeout(r, 500));
      setLoadingStep(2); // AI

      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, checks }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Request failed");
      }

      const { audit } = await res.json();
      setLoadingStep(3); // report
      await new Promise((r) => setTimeout(r, 300));

      setAudit(audit);
      setState("done");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setState("error");
    }
  };

  const reset = () => {
    setState("idle");
    setAudit(null);
    setAnalyzedUrl("");
    setError("");
  };

  return (
    <div className="app">
      <div className="header">
        <h1>
          UX <em>Auditor</em>
        </h1>
        <p className="subtitle">
          Paste any URL and get an AI-powered analysis of visual hierarchy,
          accessibility, and UX clarity — in seconds.
        </p>
      </div>

      <AuditForm onSubmit={runAudit} loading={state === "loading"} />

      {state === "error" && (
        <div className="error-banner">{error}</div>
      )}

      {state === "loading" && <LoadingState currentStep={loadingStep} />}

      {state === "done" && audit && (
        <div>
          <div className="analyzed-url">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
            {analyzedUrl}
          </div>

          <div className="score-section">
            <ScoreRing
              score={Math.round(audit.overallScore)}
              color={getScoreColor(audit.overallScore)}
            />
            <div className="score-meta">
              <h2>
                {audit.overallScore >= 80
                  ? "Excellent"
                  : audit.overallScore >= 65
                  ? "Good"
                  : audit.overallScore >= 45
                  ? "Needs Work"
                  : "Critical Issues"}
              </h2>
              <p className="score-desc">{audit.summary}</p>
              <div className="sub-scores">
                {Object.entries(audit.scoreBreakdown)
                  .filter(([, v]) => v !== null)
                  .map(([k, v]) => {
                    const label: Record<string, string> = {
                      accessibility: "Accessibility",
                      visualHierarchy: "Hierarchy",
                      uxClarity: "Clarity",
                    };
                    return (
                      <div key={k} className="sub-score">
                        <div className="sub-score-name">{label[k] ?? k}</div>
                        <div
                          className="sub-score-val"
                          style={{ color: getScoreColor(v as number) }}
                        >
                          {Math.round(v as number)}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>

          <div className="sections-grid">
            <ProblemsList problems={audit.problems} />
            <ImprovementsList improvements={audit.improvements} />
          </div>

          <SummaryCards
            quickWins={audit.quickWins}
            strengths={audit.strengths}
          />

          <button className="rerun-btn" onClick={reset}>
            ← Run another audit
          </button>
        </div>
      )}
    </div>
  );
}
