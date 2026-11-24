import "server-only";
import type { ServerClient } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/dates";

export function isCurrent(m: { valid_from: string; valid_to: string | null }, today = todayLocal()) {
  return m.valid_from <= today && (!m.valid_to || m.valid_to >= today);
}

/** Pessoas visíveis (RLS) para seletores de responsável/participante. */
export async function listPeopleOptions(supabase: ServerClient, unitId?: string) {
  let q = supabase.from("people").select("id, full_name, kind, unit_id").is("archived_at", null).order("full_name");
  if (unitId) q = q.eq("unit_id", unitId);
  const { data } = await q;
  return data ?? [];
}

export async function listTeams(supabase: ServerClient, programId: string) {
  const { data } = await supabase.from("teams").select("id, name, archived_at").eq("program_id", programId).order("name");
  return data ?? [];
}
