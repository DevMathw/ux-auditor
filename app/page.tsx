"use client";

import { useState, useEffect, useCallback } from "react";
import AuditForm from "./components/AuditForm";
import LoadingState from "./components/LoadingState";
import ScoreRing from "./components/ScoreRing";
import ProblemsList from "./components/ProblemsList";
import ImprovementsList from "./components/ImprovementsList";
import SummaryCards from "./components/SummaryCards";
import HistoryPanel from "./components/HistoryPanel";
import ScoreChart from "./components/ScoreChart";
import ExportButton from "./components/ExportButton";
import { getHistory, saveToHistory } from "./lib/history";
import type { AuditChecks, AuditResult, HistoryEntry } from "./lib/types";

function getScoreColor(score: number) {
  if (score >= 70) return "#1D9E75";
  if (score >= 45) return "#BA7517";
  return "#A32D2D";
}

type AppState = "idle" | "loading" | "done" | "error";

const ui = {
  en: {
    eyebrow: "Powered by AI",
    h1a: "UX",
    h1b: "Auditor",
    subtitle: "Paste any URL and get an AI-powered analysis of visual hierarchy, accessibility, and UX clarity — in seconds.",
    excellent: "Excellent", good: "Good", needsWork: "Needs Work", critical: "Critical Issues",
    rerun: "← Run another audit",
  },
  es: {
    eyebrow: "Impulsado por IA",
    h1a: "Auditor",
    h1b: "UX",
    subtitle: "Pega cualquier URL y obtén un análisis de jerarquía visual, accesibilidad y claridad UX impulsado por IA — en segundos.",
    excellent: "Excelente", good: "Bueno", needsWork: "Necesita trabajo", critical: "Problemas críticos",
    rerun: "← Nueva auditoría",
  },
};

function getRating(score: number, language: "en" | "es") {
  const t = ui[language];
  if (score >= 80) return t.excellent;
  if (score >= 65) return t.good;
  if (score >= 45) return t.needsWork;
  return t.critical;
}

export default function HomePage() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [loadingStep, setLoadingStep] = useState(0);
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [analyzedUrl, setAnalyzedUrl] = useState("");
  const [error, setError] = useState("");
  const [language, setLanguage] = useState<"en" | "es">("en");
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const refreshHistory = useCallback(() => setHistory(getHistory()), []);
  useEffect(() => refreshHistory(), [refreshHistory]);

  const runAudit = async (url: string, checks: AuditChecks, lang: "en" | "es") => {
    setAppState("loading");
    setLoadingStep(0);
    setError("");
    setAnalyzedUrl(url);

    try {
      setLoadingStep(0);
      await new Promise((r) => setTimeout(r, 600));
      setLoadingStep(1);
      await new Promise((r) => setTimeout(r, 500));
      setLoadingStep(2);

      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, checks, language: lang }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Request failed");
      }

      const { audit } = await res.json();
      setLoadingStep(3);
      await new Promise((r) => setTimeout(r, 300));

      setAudit(audit);
      setAppState("done");

      // Save to history
      const entry: HistoryEntry = {
        id: Date.now().toString(),
        url,
        score: Math.round(audit.overallScore),
        date: new Date().toISOString(),
        audit,
      };
      saveToHistory(entry);
      refreshHistory();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setAppState("error");
    }
  };

  const loadFromHistory = (entry: HistoryEntry) => {
    setAudit(entry.audit);
    setAnalyzedUrl(entry.url);
    setAppState("done");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const reset = () => {
    setAppState("idle");
    setAudit(null);
    setAnalyzedUrl("");
    setError("");
  };

  const t = ui[language];

  return (
    <div className="app">
      <div className="header">
        <div className="eyebrow">
          <span className="dot" /> {t.eyebrow}
        </div>
        <h1>
          {t.h1a} <em>{t.h1b}</em>
        </h1>
        <p className="subtitle">{t.subtitle}</p>
      </div>

      <AuditForm
        onSubmit={runAudit}
        loading={appState === "loading"}
        language={language}
        onLanguageChange={setLanguage}
      />

      {appState === "error" && (
        <div className="error-banner">{error}</div>
      )}

      {appState === "loading" && <LoadingState currentStep={loadingStep} />}

      {appState === "idle" && (
        <>
          <ScoreChart history={history} language={language} />
          <HistoryPanel
            history={history}
            language={language}
            onSelect={loadFromHistory}
            onHistoryChange={refreshHistory}
          />
        </>
      )}

      {appState === "done" && audit && (
        <div>
          <div className="analyzed-url">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
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
              <h2>{getRating(audit.overallScore, language)}</h2>
              <p className="score-desc">{audit.summary}</p>
              <div className="sub-scores">
                {Object.entries(audit.scoreBreakdown)
                  .filter(([, v]) => v !== null)
                  .map(([k, v]) => {
                    const label: Record<string, Record<string, string>> = {
                      en: { accessibility: "Accessibility", visualHierarchy: "Hierarchy", uxClarity: "Clarity" },
                      es: { accessibility: "Accesibilidad", visualHierarchy: "Jerarquía", uxClarity: "Claridad" },
                    };
                    return (
                      <div key={k} className="sub-score">
                        <div className="sub-score-name">{label[language][k] ?? k}</div>
                        <div className="sub-score-val" style={{ color: getScoreColor(v as number) }}>
                          {Math.round(v as number)}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>

          <div className="sections-grid">
            <ProblemsList problems={audit.problems} language={language} />
            <ImprovementsList improvements={audit.improvements} language={language} />
          </div>

          <SummaryCards
            quickWins={audit.quickWins}
            strengths={audit.strengths}
            language={language}
          />

          <div style={{ display: "flex", gap: "10px", marginTop: "1.5rem", flexWrap: "wrap" }}>
            <button className="rerun-btn" onClick={reset}>{t.rerun}</button>
            <ExportButton audit={audit} url={analyzedUrl} language={language} />
          </div>
        </div>
      )}
    </div>
  );
}
