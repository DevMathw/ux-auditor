"use client";

import { useState } from "react";
import type { AuditChecks } from "@/app/lib/types";

interface Props {
  onSubmit: (url: string, checks: AuditChecks) => void;
  loading: boolean;
}

export default function AuditForm({ onSubmit, loading }: Props) {
  const [url, setUrl] = useState("");
  const [checks, setChecks] = useState<AuditChecks>({
    accessibility: true,
    visualHierarchy: true,
    uxClarity: true,
  });

  const handleSubmit = () => {
    if (!url.trim()) return;
    let finalUrl = url.trim();
    if (!/^https?:\/\//i.test(finalUrl)) finalUrl = "https://" + finalUrl;
    onSubmit(finalUrl, checks);
  };

  const toggle = (key: keyof AuditChecks) =>
    setChecks((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="input-card">
      <label className="input-label" htmlFor="url-field">
        Website URL
      </label>
      <div className="input-row">
        <input
          id="url-field"
          className="url-input"
          type="url"
          placeholder="https://example.com"
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
          {loading ? (
            "Analyzing…"
          ) : (
            <>
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M8 1L15 8L8 15M1 8H15"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Run Audit
            </>
          )}
        </button>
      </div>
      <div className="options-row">
        {(
          [
            ["accessibility", "Accessibility"],
            ["visualHierarchy", "Visual Hierarchy"],
            ["uxClarity", "UX Clarity"],
          ] as [keyof AuditChecks, string][]
        ).map(([key, label]) => (
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