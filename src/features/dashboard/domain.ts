/**
 * Indicadores com semântica explícita de ausência (PRD RF01):
 * "sem dados" (null) é diferente de zero; denominador zero = N/A (PRD §9).
 */
export type Indicator = {
  value: number | null;
  numerator: number;
  denominator: number;
  /** Explica a origem para exibição (tabela/regra e data de corte). */
  source: string;
};

export function ratio(numerator: number, denominator: number, source: string): Indicator {
  return { value: denominator === 0 ? null : (numerator / denominator) * 100, numerator, denominator, source };
}

export function formatPercent(v: number | null, digits = 0): string {
  if (v === null || Number.isNaN(v)) return "N/A";
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: digits, minimumFractionDigits: digits })}%`;
}

/** Desvio = nota comparável − meta. Sem nota comparável → null (exibido como "sem dados"). */
export function scoreDeviation(comparableScore: number | null | undefined, target: number | null | undefined) {
  if (comparableScore === null || comparableScore === undefined || target === null || target === undefined) return null;
  return comparableScore - target;
}
