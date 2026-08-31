"use client";

import { useEffect, useState } from "react";
import { getStoredLanguage } from "./lib/history";
import type { Language } from "./lib/i18n";

const copy = {
  en: {
    heading: "Something",
    headingEm: "broke",
    subtitle: "The report couldn't be displayed. Try running the audit again.",
    retry: "← Try again",
    fallback: "Unexpected error",
  },
  es: {
    heading: "Algo",
    headingEm: "falló",
    subtitle: "No se pudo mostrar el informe. Intenta ejecutar la auditoría de nuevo.",
    retry: "← Reintentar",
    fallback: "Error inesperado",
  },
};

/**
 * Red de seguridad: si algo revienta al renderizar el informe, el usuario ve un
 * mensaje y puede reintentar, en vez de quedarse con la página en blanco.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // El idioma vive en el estado de la página que acaba de fallar, así que aquí
  // se lee de la preferencia guardada. Inicializador perezoso: leerlo en un
  // efecto provocaría un render en cascada.
  const [language] = useState<Language>(() => getStoredLanguage() ?? "en");

  useEffect(() => {
    console.error(error);
  }, [error]);

  const c = copy[language];

  return (
    <div className="app">
      <div className="header">
        <h1>
          {c.heading} <em>{c.headingEm}</em>
        </h1>
        <p className="subtitle">{c.subtitle}</p>
      </div>
      <div className="error-banner" role="alert">
        {error.message || c.fallback}
      </div>
      <button className="rerun-btn" onClick={reset}>
        {c.retry}
      </button>
    </div>
  );
}
