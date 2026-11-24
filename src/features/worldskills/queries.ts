import "server-only";
import type { ServerClient } from "@/lib/supabase/server";
import { addDays, zonedToUtc, type LocalDate } from "@/lib/dates";
import type { Allocation, AttendanceRow } from "./domain";

/** Alocações e presenças visíveis (RLS) para o cálculo de CH no período. */
export async function loadChData(supabase: ServerClient, programId: string, start: LocalDate, end: LocalDate) {
  const [{ data: allocs }, { data: sessions }] = await Promise.all([
    supabase
      .from("allocations")
      .select("id, person_id, team_id, base_weekly_minutes, percent, planned_weekly_minutes, valid_from, valid_to, note, person:people(full_name), team:teams(name)")
      .eq("program_id", programId)
      .lte("valid_from", end)
      .or(`valid_to.is.null,valid_to.gte.${start}`),
    supabase
      .from("training_sessions")
      .select("id, team_id, starts_at, actual_minutes")
      .eq("program_id", programId)
      .gte("starts_at", zonedToUtc(start).toISOString())
      .lt("starts_at", zonedToUtc(addDays(end, 1)).toISOString())
      .limit(2000),
  ]);
  const sessionById = new Map((sessions ?? []).map((s) => [s.id, s]));
  let attendance: AttendanceRow[] = [];
  if (sessionById.size) {
    const { data: att } = await supabase.from("attendance").select("session_id, person_id, attended_minutes").in("session_id", [...sessionById.keys()]);
    attendance = (att ?? []).map((a) => {
      const s = sessionById.get(a.session_id)!;
      return { person_id: a.person_id, attended_minutes: a.attended_minutes, session_starts_at: s.starts_at, team_id: s.team_id };
    });
  }
  const allocations: (Allocation & { id: string; base_weekly_minutes: number; percent: number; note: string | null; person: { full_name: string } | null; team: { name: string } | null })[] =
    (allocs ?? []).map((a) => ({
      ...a,
      percent: Number(a.percent),
      planned_weekly_minutes: a.planned_weekly_minutes ?? Math.round((a.base_weekly_minutes * Number(a.percent)) / 100),
    }));
  return { allocations, attendance, sessions: sessions ?? [] };
}
