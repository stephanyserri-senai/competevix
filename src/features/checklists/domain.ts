/** Regras puras de checklists: períodos por cadência e prontidão para conclusão. */
import { addDays, addMonths, startOfMonth, startOfWeek, type LocalDate } from "@/lib/dates";
import type { Enums } from "@/lib/database.types";

export type Cadence = Enums<"checklist_cadence">;

export const CADENCE_LABEL: Record<Cadence, string> = { semanal: "Semanal", mensal: "Mensal", avulsa: "Avulsa" };
export const ANSWER_LABEL = { sim: "Sim / atendido", nao: "Não atendido", na: "Não se aplica" } as const;
export const TEMPLATE_STATUS_LABEL = { rascunho: "Rascunho", publicado: "Publicado", substituido: "Substituído" } as const;

/** Período padrão (segunda→domingo; mês civil) que contém a data de referência. */
export function periodFor(cadence: Cadence, ref: LocalDate): { start: LocalDate; end: LocalDate } {
  if (cadence === "semanal") {
    const start = startOfWeek(ref);
    return { start, end: addDays(start, 6) };
  }
  if (cadence === "mensal") {
    const start = startOfMonth(ref);
    return { start, end: addDays(addMonths(start, 1), -1) };
  }
  return { start: ref, end: ref };
}

export type ItemForCompletion = { id: string; required: boolean; requires_evidence: boolean };
export type AnswerForCompletion = { item_id: string; value: "sim" | "nao" | "na"; evidence_count: number };

/** Pendências para concluir (mesma regra de complete_checklist_run no banco). */
export function completionIssues(items: ItemForCompletion[], answers: AnswerForCompletion[]) {
  const byItem = new Map(answers.map((a) => [a.item_id, a]));
  const missing = items.filter((i) => i.required && !byItem.has(i.id)).length;
  const noEvidence = items.filter((i) => {
    const a = byItem.get(i.id);
    return i.requires_evidence && a?.value === "sim" && a.evidence_count === 0;
  }).length;
  const issues: string[] = [];
  if (missing) issues.push(`Faltam ${missing} item(ns) obrigatório(s).`);
  if (noEvidence) issues.push(`${noEvidence} item(ns) exigem evidência anexada.`);
  return issues;
}
