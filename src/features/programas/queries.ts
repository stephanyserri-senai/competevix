import "server-only";
import type { ServerClient } from "@/lib/supabase/server";

export const PROGRAM_SELECT =
  "id, status, settings, archived_at, competition_id, cycle_id, unit_id, competition:competitions(id, code, name, kind), cycle:cycles(id, code, name, start_date, end_date), unit:units(id, code, name)" as const;

export async function listPrograms(supabase: ServerClient, opts: { includeArchived?: boolean } = {}) {
  let q = supabase.from("programs").select(PROGRAM_SELECT);
  if (!opts.includeArchived) q = q.is("archived_at", null);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).sort((a, b) => programLabel(a).localeCompare(programLabel(b), "pt-BR"));
}

export type ProgramRow = Awaited<ReturnType<typeof listPrograms>>[number];

export function programLabel(p: { competition: { name: string } | null; cycle: { name: string } | null; unit: { name: string } | null }) {
  return [p.competition?.name, p.cycle?.name, p.unit?.name].filter(Boolean).join(" · ");
}

/** Resolve o programa selecionado na URL entre os visíveis ao usuário (RLS). */
export function pickProgram(programs: ProgramRow[], requested?: string | string[] | null) {
  const id = Array.isArray(requested) ? requested[0] : requested;
  return programs.find((p) => p.id === id) ?? null;
}
