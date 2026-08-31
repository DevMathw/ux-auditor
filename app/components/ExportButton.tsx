"use client";

import type { AuditResult } from "@/app/lib/types";
import { isQuickWin } from "@/app/lib/types";
import { getScoreColor } from "@/app/lib/score";
import { t as translate, type Language } from "@/app/lib/i18n";

interface Props {
  audit: AuditResult;
  url: string;
  language: Language;
}

/** Todo lo interpolado viene de una web ajena o del modelo: se escapa siempre. */
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default function ExportButton({ audit, url, language }: Props) {
  const t = translate(language);

  const handleExport = () => {
    const date = new Date().toLocaleDateString(language === "es" ? "es-CO" : "en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const scoreColor = getScoreColor(audit.overallScore);

    const subScores = (
      [
        ["accessibility", audit.scoreBreakdown.accessibility],
        ["visualHierarchy", audit.scoreBreakdown.visualHierarchy],
        ["uxClarity", audit.scoreBreakdown.uxClarity],
      ] as const
    )
      .filter(([, v]) => v !== null)
      .map(
        ([k, v]) =>
          `<div class="sub">${esc(t.scoreLabels[k])}: <strong>${esc(v!.score)}</strong> <span class="dim">(${esc(v!.rulesPassed)}/${esc(v!.rulesApplicable)})</span></div>`
      )
      .join("");

    const quickWins = audit.findings.filter(isQuickWin);
    const quickWinsBlock = quickWins.length
      ? `<h2>${esc(t.quickWinsTitle)}</h2>
<ol class="quickwins">
${quickWins.map((f) => `<li><strong>${esc(f.title)}</strong>${f.fix ? ` — ${esc(f.fix)}` : ""}</li>`).join("")}
</ol>`
      : "";

    const findingBlock = (f: (typeof audit.findings)[number]) => {
      const evidence = f.evidence.length
        ? `<div class="ev"><span class="ev-label">${esc(t.evidence)}</span><ul>${f.evidence
            .map(
              (e) =>
                `<li>${e.selector ? `<code>${esc(e.selector)}</code> ` : ""}${e.detail ? esc(e.detail) : ""}${
                  e.snippet ? `<br><code class="snip">${esc(e.snippet)}</code>` : ""
                }</li>`
            )
            .join("")}</ul></div>`
        : "";
      const fix = f.fix
        ? `<div class="fix"><span class="ev-label">${esc(t.howToFix)}</span> ${esc(f.fix)}</div>`
        : "";
      return `
<div class="item ${esc(f.severity)}">
  <div class="item-title">${esc(f.title)}</div>
  <div class="tags">
    <span class="tag">${esc(t.severityLabels[f.severity])}</span>
    <span class="tag">${esc(t.categoryLabels[f.category] ?? f.category)}</span>
    <span class="tag">${esc(t.impactLabels[f.impact])}</span>
    <span class="tag">${esc(t.effortLabels[f.effort])}</span>
    ${f.wcag ? `<span class="tag">WCAG ${esc(f.wcag)}</span>` : ""}
    <span class="tag">${f.source === "ai" ? esc(t.sourceAi) : esc(t.sourceRule)}</span>
  </div>
  <div class="item-desc">${esc(f.description)}</div>
  ${evidence}
  ${fix}
</div>`;
    };

    const html = `<!DOCTYPE html>
<html lang="${esc(language)}">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;">
<title>${esc(t.reportTitle)} — ${esc(url)}</title>
<style>
  body { font-family: 'Georgia', serif; max-width: 780px; margin: 40px auto; padding: 0 2rem; color: #1A1A18; line-height: 1.6; }
  h1 { font-size: 2rem; font-weight: 300; margin-bottom: 0.25rem; }
  h2 { font-size: 1.05rem; font-weight: 600; margin: 2rem 0 0.75rem; border-bottom: 1px solid #eee; padding-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.04em; }
  .meta { font-size: 12px; color: #888; font-family: monospace; margin-bottom: 2rem; word-break: break-all; }
  .score-box { display: flex; align-items: center; gap: 20px; background: #f9f9f7; border: 1px solid #e0e0d8; border-radius: 12px; padding: 1.1rem 1.5rem; margin: 1rem 0 1.5rem; }
  .score-num { font-size: 3rem; font-weight: 300; color: ${scoreColor}; line-height: 1; }
  .passed { font-size: 12px; color: #666; font-family: monospace; margin-bottom: 8px; }
  .sub-scores { display: flex; gap: 0.6rem; font-size: 12px; flex-wrap: wrap; }
  .sub { background: #f0f0ea; border-radius: 6px; padding: 4px 10px; }
  .dim { color: #888; }
  .item { margin: 0.7rem 0; padding: 0.85rem 1rem; background: #fafaf8; border-left: 3px solid #ccc; border-radius: 0 6px 6px 0; page-break-inside: avoid; }
  .item-title { font-weight: 700; font-size: 14px; }
  .item-desc { font-size: 13px; color: #444; margin-top: 5px; }
  .tags { margin: 6px 0 2px; }
  .tag { display: inline-block; font-size: 9.5px; font-family: monospace; padding: 2px 7px; border-radius: 4px; margin: 0 5px 3px 0; background: #ececec; color: #555; text-transform: uppercase; letter-spacing: 0.03em; }
  .critical { border-left-color: #7A1F1F; } .high { border-left-color: #A32D2D; }
  .medium { border-left-color: #854F0B; } .low { border-left-color: #185FA5; }
  .ev, .fix { margin-top: 8px; font-size: 12px; }
  .ev ul { margin: 3px 0 0 1rem; padding: 0; }
  .ev li { margin-bottom: 3px; color: #555; }
  .ev-label { font-family: monospace; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.05em; color: #999; }
  code { font-family: 'SF Mono', Consolas, monospace; font-size: 11px; background: #eeeeea; padding: 1px 4px; border-radius: 3px; }
  code.snip { display: inline-block; margin-top: 2px; color: #666; word-break: break-all; }
  .fix { color: #1C5F3A; }
  .quickwins li { margin-bottom: 6px; font-size: 13px; }
  .callout { background: #f0f7ee; border-radius: 8px; padding: 1rem; font-size: 13.5px; margin: 0.5rem 0; }
  @media print { body { margin: 20px; } }
</style>
</head>
<body>
<h1>${esc(t.reportTitle)}</h1>
<div class="meta">${esc(url)} · ${esc(t.generated)} ${esc(date)}</div>

<div class="score-box">
  <div class="score-num">${esc(audit.overallScore)}</div>
  <div>
    <div class="passed">${esc(t.checksPassed(audit.checksPassed, audit.checksApplicable))}</div>
    <div class="sub-scores">${subScores}</div>
  </div>
</div>

${audit.summary ? `<p style="color:#444;font-size:14px;">${esc(audit.summary)}</p>` : ""}

${quickWinsBlock}

<h2>${esc(t.findings)} (${audit.findings.length})</h2>
${audit.findings.map(findingBlock).join("")}

${audit.strengths ? `<h2>${esc(t.strengths)}</h2><div class="callout">${esc(audit.strengths)}</div>` : ""}
</body>
</html>`;

    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    frame.srcdoc = html;
    frame.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      window.setTimeout(() => frame.remove(), 1000);
    };
    document.body.appendChild(frame);
  };

  return (
    <button className="rerun-btn" onClick={handleExport}>
      ↓ {t.exportPdf}
    </button>
  );
}
