/**
 * Indicadores WorldSkills (PRD §6, §9) — funções puras.
 *
 * CH = minutos efetivos / minutos previstos × 100; denominador zero = N/A.
 *  - Previsto: soma das alocações vigentes, rateadas por dia útil (seg–sex) do período real
 *    (não usa “4 semanas” fixas). Jornada e percentual variam por pessoa e vigência.
 *  - Efetivo: soma da presença individual nas sessões do período. Cada pessoa conta uma vez
 *    por sessão; horas do orientador não são multiplicadas pelo número de alunos.
 *  - Ausência reduz o efetivo (justificada continua sendo ausência; fica registrada).
 *  - Equipe dupla: por equipe, usa só alocações e sessões daquela equipe; por pessoa, soma tudo
 *    sem duplicar (presença é única por sessão).
 * Execução = itens concluídos / itens previstos no período (cancelados saem do denominador).
 * Desvio = nota comparável − meta; só com escala equivalente. Sem nota comparável = N/A.
 * Dias não úteis do calendário (feriados/recessos com affects_ch) saem do previsto.
 */
import { addDays, weekday, zonedParts, type LocalDate } from "@/lib/dates";

export type Allocation = {
  person_id: string;
  team_id: string | null;
  planned_weekly_minutes: number;
  valid_from: LocalDate;
  valid_to: LocalDate | null;
};
export type AttendanceRow = { person_id: string; attended_minutes: number; session_starts_at: string; team_id: string };
export type ChRow = { person_id: string; planned: number; effective: number; pct: number | null };

export const CH_TARGET_PCT = 95;

function businessDays(from: LocalDate, to: LocalDate, nonWorking?: Set<string>): LocalDate[] {
  const out: LocalDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const w = weekday(d);
    if (w >= 1 && w <= 5 && !nonWorking?.has(d)) out.push(d);
  }
  return out;
}

/** Minutos previstos de uma alocação no período (rateio por dia útil vigente). */
export function plannedMinutes(a: Allocation, start: LocalDate, end: LocalDate, nonWorking?: Set<string>): number {
  const from = a.valid_from > start ? a.valid_from : start;
  const to = a.valid_to && a.valid_to < end ? a.valid_to : end;
  if (from > to) return 0;
  return Math.round((a.planned_weekly_minutes / 5) * businessDays(from, to, nonWorking).length);
}

export function chByPerson(
  allocations: Allocation[],
  attendance: AttendanceRow[],
  start: LocalDate,
  end: LocalDate,
  opts: { teamId?: string; nonWorking?: Set<string> } = {},
): ChRow[] {
  const planned = new Map<string, number>();
  const effective = new Map<string, number>();
  for (const a of allocations) {
    if (opts.teamId && a.team_id !== opts.teamId) continue;
    planned.set(a.person_id, (planned.get(a.person_id) ?? 0) + plannedMinutes(a, start, end, opts.nonWorking));
  }
  for (const r of attendance) {
    if (opts.teamId && r.team_id !== opts.teamId) continue;
    const d = zonedParts(r.session_starts_at).date;
    if (d < start || d > end) continue;
    effective.set(r.person_id, (effective.get(r.person_id) ?? 0) + r.attended_minutes);
  }
  const people = new Set([...planned.keys(), ...effective.keys()]);
  return [...people].map((person_id) => {
    const p = planned.get(person_id) ?? 0;
    const e = effective.get(person_id) ?? 0;
    return { person_id, planned: p, effective: e, pct: p === 0 ? null : (e / p) * 100 };
  });
}

export function chTotal(rows: ChRow[]): { planned: number; effective: number; pct: number | null } {
  const planned = rows.reduce((s, r) => s + r.planned, 0);
  const effective = rows.reduce((s, r) => s + r.effective, 0);
  return { planned, effective, pct: planned === 0 ? null : (effective / planned) * 100 };
}

export type PlanItem = { due_date: LocalDate; status: "previsto" | "concluido" | "cancelado" };

export function executionRate(items: PlanItem[], start: LocalDate, end: LocalDate) {
  const inPeriod = items.filter((i) => i.due_date >= start && i.due_date <= end && i.status !== "cancelado");
  const done = inPeriod.filter((i) => i.status === "concluido").length;
  return { done, total: inPeriod.length, pct: inPeriod.length === 0 ? null : (done / inPeriod.length) * 100 };
}

export type Scale = "worldskills" | "percentual" | "pontos_brutos";
export type AssessmentScore = { id: string; held_on: LocalDate; type: string; scale: Scale; score: number; occupation_id: string | null };
export type RampTarget = { occupation_id: string; month: LocalDate; target: number; scale: Scale; status: "proposta" | "aprovada" };

/** Última nota publicada de equipe comparável à meta (mesma ocupação e escala). */
export function latestComparable(scores: AssessmentScore[], occupationId: string, scale: Scale) {
  return (
    scores
      .filter((s) => s.occupation_id === occupationId && s.scale === scale)
      .sort((a, b) => (a.held_on < b.held_on ? 1 : a.held_on > b.held_on ? -1 : 0))[0] ?? null
  );
}

export function rampTargetFor(ramp: RampTarget[], occupationId: string, date: LocalDate, scale: Scale) {
  const month = `${date.slice(0, 7)}-01`;
  return ramp.find((r) => r.occupation_id === occupationId && r.month === month && r.scale === scale) ?? null;
}

export function deviation(score: number | null | undefined, target: number | null | undefined) {
  if (score === null || score === undefined || target === null || target === undefined) return null;
  return Math.round((score - target) * 100) / 100;
}

export const SCALE_LABEL: Record<Scale, string> = {
  worldskills: "Escala WorldSkills",
  percentual: "Percentual (0–100)",
  pontos_brutos: "Pontos brutos",
};
export const ASSESSMENT_TYPE_LABEL = { parcial: "Parcial", completo: "Completo", externo: "Externo", diagnostico: "Diagnóstico" } as const;
export const ATTENDANCE_LABEL = { presente: "Presente", parcial: "Parcial", ausente: "Ausente", justificada: "Ausência justificada" } as const;
export const REPORT_STATUS_LABEL = { rascunho: "Rascunho", enviado: "Enviado", em_revisao: "Em revisão", aprovado: "Aprovado", devolvido: "Devolvido" } as const;
export const PLAN_STATUS_LABEL = { rascunho: "Rascunho", publicado: "Publicado", substituido: "Substituído" } as const;
export const ITEM_STATUS_LABEL = { previsto: "Previsto", concluido: "Concluído", cancelado: "Cancelado" } as const;

export function formatMinutes(min: number | null | undefined): string {
  if (min === null || min === undefined) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}
