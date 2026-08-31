"use client";

import { t as translate, type Language } from "@/app/lib/i18n";

interface Props {
  language: Language;
}

/**
 * Primera visita: antes había un formulario y nada más, así que el visitante
 * tenía que gastar una auditoría para saber si la herramienta le sirve.
 */
export default function EmptyState({ language }: Props) {
  const t = translate(language);

  return (
    <div className="section-card empty-state">
      <div className="section-title">{t.emptyTitle}</div>
      <ul className="empty-bullets">
        {t.emptyBullets.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="empty-hint">{t.emptyHint}</p>
    </div>
  );
}
