import "server-only";
import type { ServerClient } from "@/lib/supabase/server";
import type { AgendaEvent, AgendaException } from "./domain";

/**
 * Eventos (com participantes e exceções) que podem ter ocorrências no intervalo.
 * Eventos recorrentes iniciados antes do intervalo também são trazidos.
 */
export async function loadAgenda(
  supabase: ServerClient,
  opts: { programIds: string[]; teamId?: string | null; rangeStart: Date; rangeEnd: Date },
): Promise<{ events: AgendaEvent[]; exceptions: AgendaException[] }> {
  if (opts.programIds.length === 0) return { events: [], exceptions: [] };
  let q = supabase
    .from("events")
    .select("id, program_id, title, description, location, type, starts_at, ends_at, all_day, team_id, owner_person_id, recurrence_freq, recurrence_interval, recurrence_weekdays, recurrence_until, recurrence_count, updated_at, participants:event_participants(person_id)")
    .in("program_id", opts.programIds)
    .is("archived_at", null)
    .lt("starts_at", opts.rangeEnd.toISOString())
    .or(`recurrence_freq.not.is.null,ends_at.gt.${opts.rangeStart.toISOString()}`)
    .order("starts_at")
    .limit(1000);
  if (opts.teamId) q = q.eq("team_id", opts.teamId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const events: AgendaEvent[] = (data ?? []).map((e) => ({
    ...e,
    participant_ids: e.participants.map((p) => p.person_id),
  }));
  const ids = events.filter((e) => e.recurrence_freq).map((e) => e.id);
  let exceptions: AgendaException[] = [];
  if (ids.length) {
    const { data: exc } = await supabase.from("event_exceptions").select("*").in("event_id", ids);
    exceptions = exc ?? [];
  }
  return { events, exceptions };
}
