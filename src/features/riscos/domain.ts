/** Riscos (PRD RF12): probabilidade × impacto (1–5). */
export type RiskLevel = "baixo" | "moderado" | "alto" | "critico";

export function riskLevel(score: number): RiskLevel {
  if (score >= 15) return "critico";
  if (score >= 10) return "alto";
  if (score >= 5) return "moderado";
  return "baixo";
}

export const RISK_LEVEL_LABEL: Record<RiskLevel, string> = { baixo: "Baixo", moderado: "Moderado", alto: "Alto", critico: "Crítico" };
export const RISK_STATUS_LABEL = { aberto: "Aberto", mitigando: "Mitigando", fechado: "Fechado" } as const;

/** Contagem por célula da matriz [probabilidade][impacto], só riscos não fechados. */
export function riskMatrix(risks: { probability: number; impact: number; status: string }[]) {
  const m: number[][] = Array.from({ length: 5 }, () => Array(5).fill(0));
  for (const r of risks) if (r.status !== "fechado") m[r.probability - 1][r.impact - 1]++;
  return m;
}
