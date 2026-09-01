"use client";

import type { HistoryEntry } from "@/app/lib/types";
import { SCORE_COLORS, getScoreColor } from "@/app/lib/score";
import { LOCALES, t as translate, type Language } from "@/app/lib/i18n";

interface Props {
  history: HistoryEntry[];
  language: Language;
}

export default function ScoreChart({ history, language }: Props) {
  if (history.length < 2) return null;

  const sorted = [...history].reverse().slice(-10);
  const max = 100;
  const w = 520;
  const h = 120;
  const padL = 32;
  const padR = 12;
  const padT = 12;
  const padB = 28;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;

  const xStep = chartW / (sorted.length - 1);
  const toY = (score: number) => padT + chartH - (score / max) * chartH;
  const toX = (i: number) => padL + i * xStep;

  const pathD = sorted
    .map((e, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(e.score).toFixed(1)}`)
    .join(" ");

  const areaD = `${pathD} L ${toX(sorted.length - 1).toFixed(1)} ${h - padB} L ${padL} ${h - padB} Z`;

  const t = translate(language);

  return (
    <div className="section-card" style={{ marginBottom: "1.25rem" }}>
      <div className="section-title">{t.chartTitle}</div>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto", overflow: "visible" }} xmlns="http://www.w3.org/2000/svg" role="img" aria-label={t.chartTitle}>
        {/* Grid lines */}
        {[25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={padL} y1={toY(v)} x2={w - padR} y2={toY(v)} stroke="var(--border2)" strokeWidth="0.5" strokeDasharray="3 3" />
            <text x={padL - 6} y={toY(v) + 4} fontSize="9" textAnchor="end" fill="var(--muted)" fontFamily="var(--font-mono)" >
              {v}
            </text>
          </g>
        ))}

        {/* Area fill */}
        <path d={areaD} fill={SCORE_COLORS.good} opacity="0.08" />

        {/* Line */}
        <path d={pathD} fill="none" stroke={SCORE_COLORS.good} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {/* Dots + labels */}
        {sorted.map((entry, i) => (
          <g key={entry.id}>
            <circle cx={toX(i)} cy={toY(entry.score)} r="4" fill={getScoreColor(entry.score)} />
            <text x={toX(i)} y={toY(entry.score) - 8} fontSize="9" textAnchor="middle" fill={getScoreColor(entry.score)} fontFamily="var(--font-mono)" fontWeight="500">
              {entry.score}
            </text>
            <text x={toX(i)} y={h - padB + 14} fontSize="8" textAnchor="middle" fill="var(--muted)" fontFamily="var(--font-mono)">
              {new Date(entry.date).toLocaleDateString(LOCALES[language], { month: "short", day: "numeric" })}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}