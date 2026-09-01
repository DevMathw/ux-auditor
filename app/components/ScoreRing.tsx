"use client";

interface Props {
  score: number;
  color: string;
  /** Etiqueta corta bajo el número. El rating lo muestra el <h2> contiguo. */
  caption: string;
}

export default function ScoreRing({ score, color, caption }: Props) {
  const r = 46;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  return (
    <div className="relative w-[110px] h-[110px] shrink-0">
      <svg viewBox="0 0 110 110" className="w-[110px] h-[110px] -rotate-90" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
        <circle cx="55" cy="55" r={r} fill="none" stroke="var(--surface2)" strokeWidth="7"/>
        <circle cx="55" cy="55" r={r} fill="none" stroke={color} strokeWidth="7" strokeDasharray={`${dash.toFixed(1)} ${circ.toFixed(1)}`} strokeLinecap="round" style={{ transition: "stroke-dasharray 1s ease" }}/>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-medium leading-none" style={{ color, fontFamily: "var(--font-display)" }}>
          {score}
        </span>
        <span className="text-[10px] text-[var(--muted)] mt-0.5 tracking-wide font-mono">
          {caption}
        </span>
      </div>
    </div>
  );
}
