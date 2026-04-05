"use client";

import type { AuditResult } from "@/app/lib/types";

interface Props {
  audit: AuditResult;
  url: string;
  language: "en" | "es";
}

export default function ExportButton({ audit, url, language }: Props) {
  const handleExport = () => {
    const t = {
      title: language === "es" ? "Reporte de Auditoría UX" : "UX Audit Report",
      score: language === "es" ? "Puntaje General" : "Overall Score",
      problems: language === "es" ? "Problemas" : "Problems",
      improvements: language === "es" ? "Mejoras" : "Improvements",
      quickWins: language === "es" ? "Victorias Rápidas" : "Quick Wins",
      strengths: language === "es" ? "Fortalezas" : "Strengths",
      generated: language === "es" ? "Generado el" : "Generated on",
      severity: language === "es" ? "Severidad" : "Severity",
      impact: language === "es" ? "Impacto" : "Impact",
      btn: language === "es" ? "Exportar PDF" : "Export PDF",
    };

    const date = new Date().toLocaleDateString(language === "es" ? "es-CO" : "en-US", {
      year: "numeric", month: "long", day: "numeric",
    });

    const scoreColor = audit.overallScore >= 70 ? "#1D9E75" : audit.overallScore >= 45 ? "#BA7517" : "#A32D2D";

    const html = `<!DOCTYPE html>
<html lang="${language}">
<head>
<meta charset="UTF-8">
<title>${t.title} — ${url}</title>
<style>
  body { font-family: 'Georgia', serif; max-width: 780px; margin: 40px auto; padding: 0 2rem; color: #1A1A18; line-height: 1.6; }
  h1 { font-size: 2rem; font-weight: 300; margin-bottom: 0.25rem; }
  h2 { font-size: 1.1rem; font-weight: 500; margin: 2rem 0 0.75rem; border-bottom: 1px solid #eee; padding-bottom: 0.5rem; }
  .meta { font-size: 12px; color: #888; font-family: monospace; margin-bottom: 2rem; }
  .score-box { display: inline-flex; align-items: center; gap: 16px; background: #f9f9f7; border: 1px solid #e0e0d8; border-radius: 12px; padding: 1rem 1.5rem; margin: 1rem 0 2rem; }
  .score-num { font-size: 3rem; font-weight: 300; color: ${scoreColor}; line-height: 1; }
  .sub-scores { display: flex; gap: 1rem; font-size: 13px; }
  .sub { background: #f0f0ea; border-radius: 6px; padding: 4px 10px; }
  .item { margin: 0.6rem 0; padding: 0.75rem; background: #fafaf8; border-left: 3px solid #ddd; border-radius: 0 6px 6px 0; }
  .item-title { font-weight: 600; font-size: 14px; }
  .item-desc { font-size: 13px; color: #555; margin-top: 3px; }
  .tag { display: inline-block; font-size: 10px; font-family: monospace; padding: 2px 7px; border-radius: 4px; margin-right: 6px; background: #eee; }
  .high { border-left-color: #A32D2D; } .medium { border-left-color: #854F0B; } .low { border-left-color: #185FA5; }
  .callout { background: #f0f7ee; border-radius: 8px; padding: 1rem; font-size: 14px; margin: 0.5rem 0; }
  @media print { body { margin: 20px; } }
</style>
</head>
<body>
<h1>${t.title}</h1>
<div class="meta">${url} · ${t.generated} ${date}</div>

<div class="score-box">
  <div class="score-num">${audit.overallScore}</div>
  <div>
    <div style="font-size:13px;color:#666;margin-bottom:8px;">${t.score}</div>
    <div class="sub-scores">
      ${Object.entries(audit.scoreBreakdown).filter(([,v]) => v !== null).map(([k,v]) =>
        `<div class="sub">${k}: <strong>${v}</strong></div>`
      ).join("")}
    </div>
  </div>
</div>

<p style="color:#555;font-size:14px;">${audit.summary}</p>

<h2>${t.problems} (${audit.problems.length})</h2>
${audit.problems.map(p => `
<div class="item ${p.severity}">
  <div class="item-title"><span class="tag">${p.category}</span><span class="tag">${t.severity}: ${p.severity}</span>${p.title}</div>
  <div class="item-desc">${p.description}</div>
</div>`).join("")}

<h2>${t.improvements} (${audit.improvements.length})</h2>
${audit.improvements.map((imp, i) => `
<div class="item">
  <div class="item-title">${i + 1}. <span class="tag">${t.impact}: ${imp.impact}</span>${imp.title}</div>
  <div class="item-desc">${imp.description}</div>
</div>`).join("")}

${audit.quickWins ? `<h2>${t.quickWins}</h2><div class="callout">${audit.quickWins}</div>` : ""}
${audit.strengths ? `<h2>${t.strengths}</h2><div class="callout">${audit.strengths}</div>` : ""}
</body>
</html>`;

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 500);
  };

  return (
    <button className="rerun-btn" onClick={handleExport} style={{ marginTop: 0 }}>
      ↓ {language === "es" ? "Exportar PDF" : "Export PDF"}
    </button>
  );
}