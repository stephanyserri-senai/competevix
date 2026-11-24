/**
 * Regras puras de ações (RF05, PRD §9). Espelham as regras do banco para dar
 * retorno imediato na interface — o banco continua sendo a autoridade final.
 */
import { todayLocal, daysBetween, type LocalDate } from "@/lib/dates";
import type { Enums } from "@/lib/database.types";

export type ActionStatus = Enums<"action_status">;
export type ActionPriority = Enums<"action_priority">;

export const STATUS_ORDER: ActionStatus[] = ["aberta", "em_andamento", "bloqueada", "concluida", "cancelada"];

export const STATUS_LABEL: Record<ActionStatus, string> = {
  aberta: "Aberta",
  em_andamento: "Em andamento",
  bloqueada: "Bloqueada",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

export const PRIORITY_LABEL: Record<ActionPriority, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  critica: "Crítica",
};

const TRANSITIONS: Record<ActionStatus, ActionStatus[]> = {
  aberta: ["em_andamento", "bloqueada", "concluida", "cancelada"],
  em_andamento: ["aberta", "bloqueada", "concluida", "cancelada"],
  bloqueada: ["aberta", "em_andamento", "cancelada"],
  concluida: ["aberta"],
  cancelada: ["aberta"],
};

export function allowedTransitions(from: ActionStatus): ActionStatus[] {
  return TRANSITIONS[from];
}

export function isTransitionAllowed(from: ActionStatus, to: ActionStatus) {
  return from === to || TRANSITIONS[from].includes(to);
}

export function isClosed(status: ActionStatus) {
  return status === "concluida" || status === "cancelada";
}

/** Atraso é derivado de prazo + status, nunca marcado manualmente (PRD §9). */
export function isOverdue(a: { due_date: LocalDate | null; status: ActionStatus }, today = todayLocal()) {
  return Boolean(a.due_date && a.due_date < today && !isClosed(a.status));
}

export function dueLabel(a: { due_date: LocalDate | null; status: ActionStatus }, today = todayLocal()) {
  if (!a.due_date) return "Sem prazo definido";
  if (isClosed(a.status)) return null;
  const d = daysBetween(today, a.due_date);
  if (d < 0) return `Vencida há ${-d} dia${d === -1 ? "" : "s"}`;
  if (d === 0) return "Vence hoje";
  return `Vence em ${d} dia${d === 1 ? "" : "s"}`;
}

export type CompletionRule = "nada" | "nota" | "evidencia" | "nota_ou_evidencia";

export const COMPLETION_RULE_LABEL: Record<CompletionRule, string> = {
  nada: "Sem exigência adicional",
  nota: "Exige justificativa",
  evidencia: "Exige evidência anexada",
  nota_ou_evidencia: "Exige justificativa ou evidência",
};

/** Requisitos para concluir; retorna mensagens de pendência (vazio = pode concluir). */
export function completionBlockers(input: {
  rule: CompletionRule;
  requiresEvidence: boolean;
  evidenceCount: number;
  note: string | null | undefined;
  openDependencies: number;
}): string[] {
  const out: string[] = [];
  const hasNote = Boolean(input.note && input.note.trim());
  if (input.openDependencies > 0) out.push(`Há ${input.openDependencies} dependência(s) não concluída(s).`);
  if (input.requiresEvidence && input.evidenceCount === 0) out.push("Esta ação exige evidência anexada.");
  if (input.rule === "nota" && !hasNote) out.push("O programa exige justificativa de conclusão.");
  if (input.rule === "evidencia" && input.evidenceCount === 0) out.push("O programa exige evidência para concluir.");
  if (input.rule === "nota_ou_evidencia" && !hasNote && input.evidenceCount === 0)
    out.push("O programa exige justificativa ou evidência para concluir.");
  return out;
}

/** Verifica se adicionar a aresta action → dependsOn criaria ciclo. */
export function wouldCreateCycle(edges: { action_id: string; depends_on_id: string }[], actionId: string, dependsOn: string) {
  if (actionId === dependsOn) return true;
  const graph = new Map<string, string[]>();
  for (const e of edges) graph.set(e.action_id, [...(graph.get(e.action_id) ?? []), e.depends_on_id]);
  const stack = [dependsOn];
  const seen = new Set<string>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === actionId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...(graph.get(cur) ?? []));
  }
  return false;
}
