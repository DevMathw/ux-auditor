"use client";

import type { HistoryEntry } from "@/app/lib/types";

interface Props {
  history: HistoryEntry[];
  language: "en" | "es";
}

function getScoreColor(score: number) {
  if (score >= 70) return "#1D9E75";
  if (score >= 45) return "#BA7517";
  return "#A32D2D";
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

  const t = {
    title: language === "es" ? "Progreso histórico" : "Score history",
    noData: language === "es" ? "Agrega más auditorías para ver el progreso." : "Add more audits to see progress.",
  };

  return (
    <div className="section-card" style={{ marginBottom: "1.25rem" }}>
      <div className="section-title">{t.title}</div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        style={{ width: "100%", height: "auto", overflow: "visible" }}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Grid lines */}
        {[25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line
              x1={padL} y1={toY(v)} x2={w - padR} y2={toY(v)}
              stroke="var(--border2)" strokeWidth="0.5" strokeDasharray="3 3"
            />
            <text
              x={padL - 6} y={toY(v) + 4}
              fontSize="9" textAnchor="end"
              fill="var(--muted)" fontFamily="var(--font-mono)"
            >
              {v}
            </text>
          </g>
        ))}

        {/* Area fill */}
        <path d={areaD} fill="#1D9E75" opacity="0.08" />

        {/* Line */}
        <path d={pathD} fill="none" stroke="#1D9E75" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {/* Dots + labels */}
        {sorted.map((entry, i) => (
          <g key={entry.id}>
            <circle cx={toX(i)} cy={toY(entry.score)} r="4" fill={getScoreColor(entry.score)} />
            <text
              x={toX(i)} y={toY(entry.score) - 8}
              fontSize="9" textAnchor="middle"
              fill={getScoreColor(entry.score)} fontFamily="var(--font-mono)" fontWeight="500"
            >
              {entry.score}
            </text>
            <text
              x={toX(i)} y={h - padB + 14}
              fontSize="8" textAnchor="middle"
              fill="var(--muted)" fontFamily="var(--font-mono)"
            >
              {new Date(entry.date).toLocaleDateString(language === "es" ? "es-CO" : "en-US", { month: "short", day: "numeric" })}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}