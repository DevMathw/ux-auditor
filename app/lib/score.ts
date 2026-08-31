/** Única fuente de verdad para los umbrales de puntaje y sus colores. */
export const SCORE_COLORS = {
  good: "#1D9E75",
  fair: "#BA7517",
  poor: "#A32D2D",
} as const;

export type Rating = "excellent" | "good" | "needsWork" | "critical";

export function getScoreColor(score: number): string {
  if (score >= 70) return SCORE_COLORS.good;
  if (score >= 45) return SCORE_COLORS.fair;
  return SCORE_COLORS.poor;
}

export function getRating(score: number): Rating {
  if (score >= 80) return "excellent";
  if (score >= 65) return "good";
  if (score >= 45) return "needsWork";
  return "critical";
}
