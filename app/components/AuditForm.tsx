"use client";

import { useState } from "react";
import type { AuditChecks } from "@/app/lib/types";
import LanguageToggle from "./LanguageToggle";

interface Props {
  onSubmit: (url: string, checks: AuditChecks, language: "en" | "es") => void;
  loading: boolean;
  language: "en" | "es";
  onLanguageChange: (lang: "en" | "es") => void;
}

const labels = {
  en: {
    placeholder: "https://example.com",
    urlLabel: "Website URL",
    btn: "Run Audit",
    loading: "Analyzing…",
    accessibility: "Accessibility",
    visualHierarchy: "Visual Hierarchy",
    uxClarity: "UX Clarity",
  },
  es: {
    placeholder: "https://ejemplo.com",
    urlLabel: "URL del sitio web",
    btn: "Analizar",
    loading: "Analizando…",
    accessibility: "Accesibilidad",
    visualHierarchy: "Jerarquía Visual",
    uxClarity: "Claridad UX",
  },
};

export default function AuditForm({ onSubmit, loading, language, onLanguageChange }: Props) {
  const [url, setUrl] = useState("");
  const [checks, setChecks] = useState<AuditChecks>({
    accessibility: true,
    visualHierarchy: true,
    uxClarity: true,
  });

  const t = labels[language];

  const handleSubmit = () => {
    if (!url.trim()) return;
    let finalUrl = url.trim();
    if (!/^https?:\/\//i.test(finalUrl)) finalUrl = "https://" + finalUrl;
    onSubmit(finalUrl, checks, language);
  };

  const toggle = (key: keyof AuditChecks) =>
    setChecks((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="input-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
        <label className="input-label" htmlFor="url-field" style={{ marginBottom: 0 }}>
          {t.urlLabel}
        </label>
        <LanguageToggle language={language} onChange={onLanguageChange} />
      </div>
      <div className="input-row">
        <input
          id="url-field"
          className="url-input"
          type="url"
          placeholder={t.placeholder}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          className="audit-btn"
          onClick={handleSubmit}
          disabled={loading || !url.trim()}
        >
          {loading ? t.loading : (
            <>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 1L15 8L8 15M1 8H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {t.btn}
            </>
          )}
        </button>
      </div>
      <div className="options-row">
        {([
          ["accessibility", t.accessibility],
          ["visualHierarchy", t.visualHierarchy],
          ["uxClarity", t.uxClarity],
        ] as [keyof AuditChecks, string][]).map(([key, label]) => (
          <label key={key} className="option-chip">
            <input
              type="checkbox"
              checked={checks[key]}
              onChange={() => toggle(key)}
            />
            {label}
          </label>
        ))}
      </div>
    </div>
  );
}