"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import AuditForm from "./AuditForm";
import EmptyState from "./EmptyState";
import LoadingState from "./LoadingState";
import ScoreRing from "./ScoreRing";
import {
  getHistory,
  getStoredLanguage,
  saveToHistory,
  storeLanguage,
} from "../lib/history";
import { getRating, getScoreColor } from "../lib/score";
import { errorMessage, t as translate, type Language } from "../lib/i18n";
import type { AuditChecks, AuditResult, HistoryEntry } from "../lib/types";

// Nada de esto se muestra hasta que hay un informe (o historial), así que se
// carga bajo demanda en vez de lastrar la primera carga.
const FindingsList = dynamic(() => import("./FindingsList"));
const SummaryCards = dynamic(() => import("./SummaryCards"));
const ExportButton = dynamic(() => import("./ExportButton"));
const HistoryPanel = dynamic(() => import("./HistoryPanel"));
const ScoreChart = dynamic(() => import("./ScoreChart"));
const ComparePanel = dynamic(() => import("./ComparePanel"));
const SelfAudit = dynamic(() => import("./SelfAudit"));

type AppState = "idle" | "loading" | "done" | "error";

export default function AuditWorkspace() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [analyzedUrl, setAnalyzedUrl] = useState("");
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState("");
  const [language, setLanguage] = useState<Language>("en");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [formKey, setFormKey] = useState(0);

  const abortRef = useRef<AbortController | null>(null);

  const refreshHistory = useCallback(() => setHistory(getHistory()), []);

  useEffect(() => {
    refreshHistory();
    const stored = getStoredLanguage();
    if (stored) setLanguage(stored);
  }, [refreshHistory]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const changeLanguage = useCallback((lang: Language) => {
    setLanguage(lang);
    storeLanguage(lang);
  }, []);

  const runAudit = async (url: string, checks: AuditChecks, lang: Language) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setAppState("loading");
    setError("");
    setAnalyzedUrl(url);
    setFromCache(false);

    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ url, checks, language: lang }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(errorMessage(lang, data.error ?? "analysis_failed"));
        setAppState("error");
        return;
      }

      const result: AuditResult = data.audit;
      const finalUrl: string = data.analyzedUrl ?? url;

      setAudit(result);
      setAnalyzedUrl(finalUrl);
      setFromCache(Boolean(data.cached));
      setAppState("done");

      saveToHistory({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        url: finalUrl,
        score: Math.round(result.overallScore),
        date: new Date().toISOString(),
        language: lang,
        audit: result,
      });
      refreshHistory();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(errorMessage(lang, "network"));
      setAppState("error");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const cancelAudit = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setAppState("idle");
  };

  const loadFromHistory = (entry: HistoryEntry) => {
    // Un informe se lee en el idioma en que se generó, pero eso no cambia la
    // preferencia guardada del usuario.
    setLanguage(entry.language);
    setAudit(entry.audit);
    setAnalyzedUrl(entry.url);
    setFromCache(false);
    setAppState("done");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const reset = () => {
    setAppState("idle");
    setAudit(null);
    setAnalyzedUrl("");
    setError("");
    setFormKey((k) => k + 1);
  };

  const t = translate(language);

  return (
    <>
      <header className="header">
        <div className="eyebrow">
          <span className="dot" /> {t.eyebrow}
        </div>
        <h1>
          {t.h1a} <em>{t.h1b}</em>
        </h1>
        <p className="subtitle">{t.subtitle}</p>
      </header>

      <AuditForm
        key={formKey}
        onSubmit={runAudit}
        onCancel={cancelAudit}
        loading={appState === "loading"}
        language={language}
        onLanguageChange={changeLanguage}
      />

      {appState === "error" && (
        <div className="error-banner" role="alert">{error}</div>
      )}

      {appState === "loading" && <LoadingState language={language} />}

      {appState === "idle" && (
        <>
          {history.length === 0 && <EmptyState language={language} />}
          {history.length === 0 && <SelfAudit language={language} />}
          <ComparePanel history={history} language={language} />
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
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
            <span className="sr-only">{t.analyzedUrlLabel}: </span>
            {analyzedUrl}
          </div>

          <section className="score-section">
            <ScoreRing
              score={audit.overallScore}
              color={getScoreColor(audit.overallScore)}
              caption={t.outOf100}
            />
            <div className="score-meta">
              <h2>{t.ratings[getRating(audit.overallScore)]}</h2>
              <p className="checks-passed">
                {t.checksPassed(audit.checksPassed, audit.checksApplicable)}
              </p>
              {audit.summary && <p className="score-desc">{audit.summary}</p>}
              <div className="sub-scores">
                {(
                  [
                    ["accessibility", audit.scoreBreakdown.accessibility],
                    ["visualHierarchy", audit.scoreBreakdown.visualHierarchy],
                    ["uxClarity", audit.scoreBreakdown.uxClarity],
                  ] as const
                )
                  .filter(([, v]) => v !== null)
                  .map(([key, value]) => (
                    <div key={key} className="sub-score">
                      <div className="sub-score-name">{t.scoreLabels[key]}</div>
                      <div className="sub-score-val" style={{ color: getScoreColor(value!.score) }}>
                        {value!.score}
                      </div>
                      <div className="sub-score-detail">
                        {value!.rulesPassed}/{value!.rulesApplicable}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </section>

          {audit.confidence === "low" && (
            <p className="notice notice-warn" role="alert">{t.lowConfidence}</p>
          )}
          {audit.rendered ? (
            <p className="notice notice-ok">{t.renderedBadge}</p>
          ) : (
            <p className="notice">{t.notRenderedNotice}</p>
          )}
          {fromCache && <p className="notice">{t.cachedNotice}</p>}
          {!audit.aiEnabled && <p className="notice">{t.aiDisabledNotice}</p>}

          <div className="result-actions">
            <button className="rerun-btn" onClick={reset}>{t.rerun}</button>
            <ExportButton audit={audit} url={analyzedUrl} language={language} />
          </div>

          <FindingsList findings={audit.findings} language={language} />

          <SummaryCards
            quickWins={audit.quickWins}
            strengths={audit.strengths}
            language={language}
          />
        </div>
      )}
    </>
  );
}
