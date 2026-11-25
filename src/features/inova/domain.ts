/**
 * INOVA (PRD §7) — regras puras.
 * Pontuação de uma avaliação = soma dos critérios-folha (grupos são a soma dos filhos).
 * Resultado da banca = média das avaliações COMPLETAS (submetidas), sem arredondar antes
 * da classificação. Faixas configuráveis na versão da rubrica (padrão do PRD).
 */
export type Criterion = { id: string; parent_id: string | null; code: string; name: string; max_score: number; position: number };
export type Evaluation = { assignment_id: string; status: "pendente" | "submetida"; scores: { criterion_id: string; score: number }[] };
export type Band = { min: number; rotulo: string };

export const DEFAULT_BANDS: Band[] = [
  { min: 95, rotulo: "Excelente" },
  { min: 90, rotulo: "Muito bom" },
  { min: 80, rotulo: "Intermediário" },
  { min: 70, rotulo: "Baixo" },
  { min: 0, rotulo: "Insuficiente" },
];

export function leaves(criteria: Criterion[]) {
  const parents = new Set(criteria.map((c) => c.parent_id).filter(Boolean));
  return criteria.filter((c) => !parents.has(c.id));
}

export function topLevel(criteria: Criterion[]) {
  return criteria.filter((c) => !c.parent_id).sort((a, b) => a.position - b.position);
}

/** Pontuação por critério de topo (grupo = soma dos filhos; critério simples = a própria nota). */
export function evaluationBreakdown(criteria: Criterion[], ev: Evaluation) {
  const score = new Map(ev.scores.map((s) => [s.criterion_id, s.score]));
  const groups: Record<string, number> = {};
  for (const top of topLevel(criteria)) {
    const kids = criteria.filter((c) => c.parent_id === top.id);
    groups[top.code] = kids.length ? kids.reduce((s, k) => s + (score.get(k.id) ?? 0), 0) : score.get(top.id) ?? 0;
  }
  const total = Object.values(groups).reduce((s, v) => s + v, 0);
  const complete = leaves(criteria).every((l) => score.has(l.id));
  return { groups, total, complete };
}

export function classify(score: number | null, bands: Band[] = DEFAULT_BANDS): string | null {
  if (score === null) return null;
  const sorted = [...bands].sort((a, b) => b.min - a.min);
  return sorted.find((b) => score >= b.min)?.rotulo ?? null;
}

/** Resultado consolidado: só avaliações submetidas e completas entram na média. */
export function panelResult(criteria: Criterion[], evaluations: Evaluation[], bands: Band[] = DEFAULT_BANDS) {
  const valid = evaluations
    .filter((e) => e.status === "submetida")
    .map((e) => evaluationBreakdown(criteria, e))
    .filter((b) => b.complete);
  if (valid.length === 0) return { count: 0, total: null, groups: {} as Record<string, number>, classification: null, excluded: evaluations.length };
  const groups: Record<string, number> = {};
  for (const top of topLevel(criteria)) groups[top.code] = valid.reduce((s, v) => s + v.groups[top.code], 0) / valid.length;
  const total = valid.reduce((s, v) => s + v.total, 0) / valid.length;
  return { count: valid.length, total, groups, classification: classify(total, bands), excluded: evaluations.length - valid.length };
}

export function bandsFrom(settings: unknown): Band[] {
  const f = (settings as { faixas?: Band[] } | null)?.faixas;
  return Array.isArray(f) && f.every((b) => typeof b.min === "number" && typeof b.rotulo === "string") ? f : DEFAULT_BANDS;
}

/** Formata sem arredondar o valor usado na classificação (exibe até 2 casas). */
export function formatScore(v: number | null | undefined) {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

export const STAGES = [
  "prospeccao", "selecao", "anterioridade", "validacao_problema", "prototipo", "validacao_tecnica_financeira", "banca_pitch", "prioritario",
] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABEL: Record<Stage, string> = {
  prospeccao: "Prospecção",
  selecao: "Seleção",
  anterioridade: "Anterioridade",
  validacao_problema: "Validação do problema",
  prototipo: "Protótipo",
  validacao_tecnica_financeira: "Validação técnica/financeira",
  banca_pitch: "Banca/pitch",
  prioritario: "Prioritário",
};
export const EVIDENCE_LABEL = {
  comparacao_mercado: "Comparação de mercado",
  diferencial_tecnico: "Diferencial técnico",
  validacao_industrial: "Validação industrial",
  teste_produtividade_custo_qualidade: "Teste de produtividade/custo/qualidade",
  viabilidade_financeira: "Viabilidade financeira",
  modelo_negocio: "Modelo de negócio",
  anterioridade: "Busca de anterioridade",
  prototipo_funcional: "Protótipo funcional",
  outro: "Outra",
} as const;

export function nextStage(s: Stage): Stage | null {
  const i = STAGES.indexOf(s);
  return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1] : null;
}

/** Indicadores do INOVA (PRD §7): funil, protótipos funcionais e validação empresarial dos prioritários. */
export function inovaIndicators(projects: { id: string; stage: Stage; evidenceKinds: string[] }[]) {
  const funnel = Object.fromEntries(STAGES.map((s) => [s, projects.filter((p) => p.stage === s).length])) as Record<Stage, number>;
  const priority = projects.filter((p) => p.stage === "prioritario");
  const validated = priority.filter((p) => p.evidenceKinds.includes("validacao_industrial")).length;
  const prototypes = projects.filter((p) => p.evidenceKinds.includes("prototipo_funcional")).length;
  return {
    funnel,
    prototypes,
    priorityCount: priority.length,
    priorityValidatedPct: priority.length ? (validated / priority.length) * 100 : null,
  };
}
