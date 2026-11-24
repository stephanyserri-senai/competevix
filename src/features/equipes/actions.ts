"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { dbFailure, invalid, parseForm, success, type FormState } from "@/lib/forms";
import { endTeamMemberSchema, personSchema, teamMemberSchema, teamSchema } from "@/features/schemas";

export async function saveTeam(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(teamSchema, fd);
  if (!p.success) return invalid(p.error);
  const { id, ...v } = p.data;
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("teams").update(v).eq("id", id).select("id").single()
    : await supabase.from("teams").insert(v).select("id").single();
  if (error) return dbFailure(error);
  revalidatePath("/equipes");
  return success("Equipe salva.");
}

export async function savePerson(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(personSchema, fd);
  if (!p.success) return invalid(p.error);
  const { id, ...v } = p.data;
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("people").update(v).eq("id", id).select("id").single()
    : await supabase.from("people").insert(v).select("id").single();
  if (error) return dbFailure(error);
  revalidatePath("/equipes/pessoas");
  return success("Pessoa salva.");
}

export async function addTeamMember(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(teamMemberSchema, fd);
  if (!p.success) return invalid(p.error);
  const supabase = await createClient();
  const { error } = await supabase.from("team_members").insert(p.data).select("id").single();
  if (error) return dbFailure(error);
  revalidatePath(`/equipes/${p.data.team_id}`);
  return success("Vínculo registrado.");
}

/** Encerra a vigência (mantém histórico) em vez de apagar o vínculo. */
export async function endTeamMember(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(endTeamMemberSchema, fd);
  if (!p.success) return invalid(p.error);
  const supabase = await createClient();
  const { data, error } = await supabase.from("team_members").update({ valid_to: p.data.valid_to }).eq("id", p.data.id).select("team_id").single();
  if (error) return dbFailure(error);
  revalidatePath(`/equipes/${data.team_id}`);
  return success("Vigência encerrada.");
}
