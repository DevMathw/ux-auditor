/**
 * Contabilidad de uso y coste de la capa de IA.
 *
 * No pretende ser un dashboard: pretende responder "¿cuánto cuesta operar
 * esto?" con números medidos en vez de estimados. Vive en memoria, así que se
 * reinicia con el proceso — suficiente para una instancia, y el sitio donde
 * enchufar un almacén persistente si algún día hace falta.
 */

/** Precios de claude-sonnet-5, dólares por millón de tokens. */
export const PRICE_PER_MTOK = { input: 2.0, output: 10.0 } as const;

export interface AuditUsage {
  inputTokens: number;
  outputTokens: number;
  hadScreenshot: boolean;
}

interface UsageTotals {
  audits: number;
  aiCalls: number;
  screenshots: number;
  inputTokens: number;
  outputTokens: number;
  since: string;
}

const totals: UsageTotals = {
  audits: 0,
  aiCalls: 0,
  screenshots: 0,
  inputTokens: 0,
  outputTokens: 0,
  since: new Date().toISOString(),
};

export function recordAudit(usage: AuditUsage): void {
  totals.audits += 1;
  // Una auditoría sin tokens es una auditoría puramente determinista: cuenta
  // como auditoría pero no como llamada a la IA.
  if (usage.inputTokens > 0 || usage.outputTokens > 0) {
    totals.aiCalls += 1;
    totals.inputTokens += usage.inputTokens;
    totals.outputTokens += usage.outputTokens;
  }
  if (usage.hadScreenshot) totals.screenshots += 1;
}

export function estimateCost(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1e6) * PRICE_PER_MTOK.input +
    (outputTokens / 1e6) * PRICE_PER_MTOK.output
  );
}

export interface UsageReport extends UsageTotals {
  totalCostUsd: number;
  averageCostPerAiCallUsd: number;
  /** Cuántas auditorías salieron gratis por no usar la capa de IA. */
  freeAudits: number;
}

export function getUsageReport(): UsageReport {
  const totalCostUsd = estimateCost(totals.inputTokens, totals.outputTokens);
  return {
    ...totals,
    totalCostUsd: Number(totalCostUsd.toFixed(5)),
    averageCostPerAiCallUsd:
      totals.aiCalls > 0 ? Number((totalCostUsd / totals.aiCalls).toFixed(5)) : 0,
    freeAudits: totals.audits - totals.aiCalls,
  };
}

/** Sólo para tests. */
export function resetUsage(): void {
  totals.audits = 0;
  totals.aiCalls = 0;
  totals.screenshots = 0;
  totals.inputTokens = 0;
  totals.outputTokens = 0;
  totals.since = new Date().toISOString();
}
