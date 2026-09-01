"use client";

import { useState } from "react";
import { t as translate, type Language } from "@/app/lib/i18n";

/**
 * Publica el informe y devuelve un enlace.
 *
 * Sólo aparece si el servidor pudo guardar la auditoría: sin `auditId` no hay
 * nada que compartir, y un botón que siempre falla es peor que no tenerlo.
 *
 * Compartir es explícito. Guardar la auditoría no la hace pública; publicarla
 * es un acto separado, y se puede deshacer desde aquí mismo.
 */

interface Props {
  auditId: string;
  language: Language;
}

type State = "idle" | "working" | "shared" | "failed";

export default function ShareButton({ auditId, language }: Props) {
  const t = translate(language);
  const [state, setState] = useState<State>("idle");
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);

  async function share() {
    setState("working");
    try {
      const res = await fetch(`/api/audits/${auditId}/share`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.path) {
        setState("failed");
        return;
      }
      const absolute = new URL(data.path, window.location.origin).toString();
      setUrl(absolute);
      setState("shared");
      // El portapapeles puede estar denegado; el enlace sigue visible y
      // seleccionable, así que no es un fallo.
      try {
        await navigator.clipboard.writeText(absolute);
        setCopied(true);
      } catch {
        setCopied(false);
      }
    } catch {
      setState("failed");
    }
  }

  async function stop() {
    setState("working");
    try {
      await fetch(`/api/audits/${auditId}/share`, { method: "DELETE" });
    } catch {
      // Si la petición no llega, el enlace sigue vivo; se reintenta pulsando.
    }
    setUrl("");
    setCopied(false);
    setState("idle");
  }

  if (state === "shared") {
    return (
      <span className="share-result">
        <input
          className="share-link"
          readOnly
          value={url}
          aria-label={t.share}
          onFocus={(e) => e.currentTarget.select()}
        />
        <span className="share-copied" role="status">
          {copied ? t.shareCopied : ""}
        </span>
        <button type="button" className="rerun-btn" onClick={stop}>
          {t.shareStop}
        </button>
      </span>
    );
  }

  return (
    <>
      <button type="button" className="rerun-btn" onClick={share} disabled={state === "working"}>
        {t.share}
      </button>
      {state === "failed" && (
        <span className="share-error" role="alert">
          {t.shareFailed}
        </span>
      )}
    </>
  );
}
