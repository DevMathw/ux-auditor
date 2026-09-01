"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AuditFinding } from "@/app/lib/types";
import { errorMessage, t as translate, type Language } from "@/app/lib/i18n";

interface Props {
  finding: AuditFinding;
  language: Language;
  onClose: () => void;
}

const categoryColors: Record<string, string> = {
  accessibility: "var(--warn)",
  hierarchy: "var(--info)",
  clarity: "var(--accent-muted)",
  performance: "var(--danger)",
};

export default function ExplainModal({ finding, language, onClose }: Props) {
  const [explanation, setExplanation] = useState("");
  const [loading, setLoading] = useState(true);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const t = translate(language);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const res = await fetch("/api/explain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            title: finding.title,
            description: finding.description,
            category: finding.category,
            severity: finding.severity,
            language,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setExplanation(errorMessage(language, data.error ?? "explanation_failed"));
        } else {
          setExplanation(data.explanation || t.explanationFailed);
        }
      } catch (err) {
        // Al cerrar el modal abortamos: no es un error que haya que mostrar.
        if (err instanceof DOMException && err.name === "AbortError") return;
        setExplanation(t.explanationFailed);
      }
      setLoading(false);
    }

    load();
    // Cancela la petición en curso al cerrar o al cambiar de problema, para que
    // una respuesta tardía no pise a la del problema que se está viendo ahora.
    return () => controller.abort();
  }, [finding, language, t.explanationFailed]);

  // Escape para cerrar y foco atrapado dentro del diálogo.
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [handleKeyDown]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 50, padding: "1rem",
      }}
    >
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="explain-modal-title" onClick={(e) => e.stopPropagation()}style={{ background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: "16px", padding: "1.5rem", maxWidth: "480px", width: "100%", }} >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
          <div>
            <span style={{ display: "inline-block", fontSize: "10px", fontFamily: "var(--font-mono)", padding: "2px 8px", borderRadius: "4px", marginBottom: "6px", background: `color-mix(in srgb, ${categoryColors[finding.category] ?? "var(--muted)"} 15%, transparent)`, color: categoryColors[finding.category] ?? "var(--muted)", }}>
              {finding.category}
            </span>
            <h3 id="explain-modal-title" style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontSize: "1.1rem" }}>
              {finding.title}
            </h3>
          </div>
          <button ref={closeRef} onClick={onClose} aria-label={t.close} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: "20px", padding: "0 0 0 12px", lineHeight: 1, }}>
             ×
          </button>
        </div>

        <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "1rem", lineHeight: 1.6 }}>
          {finding.description}
        </p>

        <div aria-live="polite" aria-busy={loading} style={{ background: "var(--bg)", borderRadius: "10px", padding: "1rem", fontSize: "13.5px", lineHeight: 1.7, minHeight: "80px", color: "var(--text)", whiteSpace: "pre-wrap", }} >
          {loading ? (
            <span style={{ color: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: "12px" }}>
              {t.generating}
            </span>
          ) : explanation}
        </div>

        <button onClick={onClose} style={{ marginTop: "1rem", width: "100%", background: "var(--text)", color: "var(--bg)", border: "none", borderRadius: "10px", padding: "0.65rem", fontFamily: "var(--font-body)", fontSize: "14px", cursor: "pointer", }} >
          {t.close}
        </button>
      </div>
    </div>
  );
}
