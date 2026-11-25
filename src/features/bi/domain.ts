/**
 * BI de ações (decisão 25/11): acompanhar as ações executadas por frente, responsável,
 * tema e ao longo do tempo. Funções puras; "sem dados" ≠ zero (denominador 0 = null).
 */
import { addDays, startOfWeek, todayLocal, zonedParts, type LocalDate } from "@/lib/dates";

export type Stage = "a_fazer" | "em_andamento" | "em_validacao" | "concluida" | "cancelada";
export const STAGES: Stage[] = ["a_fazer", "em_andamento", "em_validacao", "concluida", "cancelada"];
export const BOARD_STAGES: Stage[] = ["a_fazer", "em_andamento", "em_validacao", "concluida"];
export const STAGE_LABEL: Record<Stage, string> = {
  a_fazer: "A fazer", em_andamento: "Em andamento", em_validacao: "Em validação", concluida: "Concluída", cancelada: "Cancelada",
};
export const THEME_LABEL = {
  treino: "Treino", infraestrutura: "Infraestrutura", compras: "Compras", pessoas: "Pessoas", eventos: "Eventos", gestao: "Gestão", outro: "Outro",
} as const;
export type Theme = keyof typeof THEME_LABEL;

export type BiAction = {
  id: string;
  stage: Stage;
  due_date: LocalDate | null;
  created_at: string;
  completed_at: string | null;
  is_overdue: boolean;
  completed_on_time: boolean | null;
  blocked: boolean;
  competition_id: string | null;
  owner_person_id: string | null;
  theme: Theme | null;
};

const localDate = (iso: string | null) => (iso ? zonedParts(iso).date : null);
const active = (a: BiAction) => a.stage !== "concluida" && a.stage !== "cancelada";

export function kpis(rows: BiAction[], start: LocalDate, end: LocalDate) {
  const done = rows.filter((a) => a.stage === "concluida" && (localDate(a.completed_at) ?? "") >= start && (localDate(a.completed_at) ?? "") <= end);
  const withDue = done.filter((a) => a.completed_on_time !== null);
  return {
    active: rows.filter(active).length,
    completedInPeriod: done.length,
    onTimePct: withDue.length ? (withDue.filter((a) => a.completed_on_time).length / withDue.length) * 100 : null,
    onTimeBase: withDue.length,
    overdue: rows.filter((a) => a.is_overdue).length,
    inValidation: rows.filter((a) => a.stage === "em_validacao").length,
    blocked: rows.filter((a) => a.blocked && active(a)).length,
    withoutOwner: rows.filter((a) => active(a) && !a.owner_person_id).length,
  };
}

export type GroupRow = { key: string; label: string; a_fazer: number; em_andamento: number; em_validacao: number; concluida: number; overdue: number; total: number };

/** Contagem por grupo e etapa (canceladas fora), ordenada por total. */
export function byGroup<T extends BiAction>(rows: T[], keyOf: (a: T) => string | null, labelOf: (k: string) => string, emptyLabel = "Sem definição"): GroupRow[] {
  const map = new Map<string, GroupRow>();
  for (const a of rows) {
    if (a.stage === "cancelada") continue;
    const k = keyOf(a) ?? "__none";
    const g = map.get(k) ?? { key: k, label: k === "__none" ? emptyLabel : labelOf(k), a_fazer: 0, em_andamento: 0, em_validacao: 0, concluida: 0, overdue: 0, total: 0 };
    g[a.stage as "a_fazer" | "em_andamento" | "em_validacao" | "concluida"]++;
    if (a.is_overdue) g.overdue++;
    g.total++;
    map.set(k, g);
  }
  return [...map.values()].sort((x, y) => y.total - x.total || x.label.localeCompare(y.label, "pt-BR"));
}

/** Criadas × concluídas por semana (seg–dom), últimas N semanas até hoje. */
export function weekly(rows: BiAction[], weeks = 12, today: LocalDate = todayLocal()) {
  const last = startOfWeek(today);
  const out = Array.from({ length: weeks }, (_, i) => {
    const start = addDays(last, -7 * (weeks - 1 - i));
    return { week: start, criadas: 0, concluidas: 0 };
  });
  const idx = (d: LocalDate | null) => {
    if (!d) return -1;
    const w = startOfWeek(d);
    return out.findIndex((o) => o.week === w);
  };
  for (const a of rows) {
    const c = idx(localDate(a.created_at));
    if (c >= 0) out[c].criadas++;
    if (a.stage === "concluida") {
      const k = idx(localDate(a.completed_at));
      if (k >= 0) out[k].concluidas++;
    }
  }
  return out;
}

/** Próximas etapas possíveis no quadro (mesma regra do banco; supervisão conclui e devolve). */
export function nextStages(stage: Stage, isSupervisor: boolean): Stage[] {
  switch (stage) {
    case "a_fazer": return isSupervisor ? ["em_andamento", "em_validacao", "concluida"] : ["em_andamento", "em_validacao"];
    case "em_andamento": return isSupervisor ? ["a_fazer", "em_validacao", "concluida"] : ["a_fazer", "em_validacao"];
    case "em_validacao": return isSupervisor ? ["concluida", "em_andamento"] : [];
    case "concluida": return isSupervisor ? ["em_andamento"] : [];
    case "cancelada": return isSupervisor ? ["a_fazer"] : [];
  }
}

/** Movimentos que exigem texto (devolver, reabrir). */
export function needsNote(from: Stage, to: Stage) {
  return (from === "em_validacao" && to === "em_andamento") || (from === "concluida" || from === "cancelada");
}
