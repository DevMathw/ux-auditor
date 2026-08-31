"use client";

import { useState } from "react";
import type { AuditChecks } from "@/app/lib/types";
import { t as translate, type Language } from "@/app/lib/i18n";
import LanguageToggle from "./LanguageToggle";

interface Props {
  onSubmit: (url: string, checks: AuditChecks, language: Language) => void;
  onCancel: () => void;
  loading: boolean;
  language: Language;
  onLanguageChange: (lang: Language) => void;
}

export default function AuditForm({
  onSubmit,
  onCancel,
  loading,
  language,
  onLanguageChange,
}: Props) {
  const [url, setUrl] = useState("");
  const [checks, setChecks] = useState<AuditChecks>({
    accessibility: true,
    visualHierarchy: true,
    uxClarity: true,
  });

  const t = translate(language);
  const noAreaSelected = !checks.accessibility && !checks.visualHierarchy && !checks.uxClarity;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!url.trim() || loading || noAreaSelected) return;
    // Escribir "example.com" debe funcionar: la mayoría de la gente no teclea
    // el protocolo.
    let finalUrl = url.trim();
    if (!/^https?:\/\//i.test(finalUrl)) finalUrl = "https://" + finalUrl;
    onSubmit(finalUrl, checks, language);
  };

  const toggle = (key: keyof AuditChecks) =>
    setChecks((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    /*
     * noValidate a propósito: type="url" da el teclado correcto en móvil, pero
     * su validación nativa bloquea el envío de "example.com" — justo el caso que
     * el normalizador de abajo existe para resolver. Sin esto, el usuario recibe
     * un tooltip del navegador en vez de una auditoría, y el servidor ya valida
     * la URL con mensajes propios y traducidos.
     */
    <form className="input-card" onSubmit={handleSubmit} noValidate>
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
          autoComplete="off"
          spellCheck={false}
          disabled={loading}
        />
        {loading ? (
          /*
           * key distinta en cada rama: sin ella React reutiliza el mismo nodo
           * DOM para dos botones semánticamente distintos (enviar y cancelar),
           * mutando su type y sus manejadores en sitio. Darles identidad propia
           * es más correcto y evita que el nodo arrastre estado del anterior.
           */
          <button key="cancel" type="button" className="audit-btn" onClick={onCancel}>
            {t.cancel}
          </button>
        ) : (
          <button
            key="submit"
            type="submit"
            className="audit-btn"
            disabled={!url.trim() || noAreaSelected}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 1L15 8L8 15M1 8H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t.runAudit}
          </button>
        )}
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
              disabled={loading}
            />
            {label}
          </label>
        ))}
      </div>
    </form>
  );
}
