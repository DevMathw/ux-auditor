"use client";

import { LANGUAGES, type Language } from "@/app/lib/i18n";

interface Props {
  language: Language;
  onChange: (lang: Language) => void;
}

const NAMES: Record<Language, string> = {
  en: "English",
  es: "Español",
};

export default function LanguageToggle({ language, onChange }: Props) {
  return (
    <div
      role="group"
      aria-label="Language"
      style={{
        display: "inline-flex",
        border: "1px solid var(--border2)",
        borderRadius: "10px",
        overflow: "hidden",
        fontFamily: "var(--font-mono)",
        fontSize: "12px",
      }}
    >
      {LANGUAGES.map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => onChange(lang)}
          aria-pressed={language === lang}
          aria-label={NAMES[lang]}
          style={{
            padding: "6px 14px",
            minWidth: "48px",
            minHeight: "44px",
            border: "none",
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
            fontSize: "12px",
            fontWeight: language === lang ? 500 : 400,
            background: language === lang ? "var(--text)" : "transparent",
            color: language === lang ? "var(--bg)" : "var(--muted)",
            transition: "all 0.15s",
            letterSpacing: "0.04em",
          }}
        >
          {lang.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
