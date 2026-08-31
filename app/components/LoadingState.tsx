"use client";

import { t as translate, type Language } from "@/app/lib/i18n";

interface Props {
  language: Language;
}

const ICONS = ["↓", "⊙", "✦", "≡"];

/**
 * El trabajo real ocurre en el servidor en una sola petición, así que no
 * podemos saber en qué paso va. En lugar de simularlo con temporizadores, la
 * lista describe lo que se está haciendo y el spinner indica que sigue en curso.
 */
export default function LoadingState({ language }: Props) {
  const t = translate(language);

  return (
    <div className="loading-state" role="status" aria-live="polite">
      <div className="spinner" />
      <div className="loading-text">{t.loadingTitle}</div>
      <div className="loading-steps">
        {t.steps.map((label, i) => (
          <div key={label} className="step-item active">
            <span className="step-icon">{ICONS[i]}</span>
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
