"use client";

interface Props {
  language: "en" | "es";
  onChange: (lang: "en" | "es") => void;
}

export default function LanguageToggle({ language, onChange }: Props) {
  return (
    <div style={{
      display: "inline-flex",
      border: "1px solid var(--border2)",
      borderRadius: "10px",
      overflow: "hidden",
      fontFamily: "var(--font-mono)",
      fontSize: "12px",
    }}>
      {(["en", "es"] as const).map((lang) => (
        <button
          key={lang}
          onClick={() => onChange(lang)}
          style={{
            padding: "6px 14px",
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
          {lang === "en" ? "EN" : "ES"}
        </button>
      ))}
    </div>
  );
}