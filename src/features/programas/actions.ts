"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { dbFailure, invalid, parseForm, success, type FormState } from "@/lib/forms";
import {
  competitionSchema, cycleSchema, occupationSchema, programSchema, programSettingsSchema, stageSchema, unitSchema,
} from "@/features/schemas";

/*
 * Todas as escritas usam o cliente da sessão do usuário: o RLS decide se a operação é
 * permitida (ex.: só administradores alteram o catálogo). `.select().single()` faz
 * atualizações sem permissão falharem explicitamente em vez de afetarem 0 linhas.
 */

export async function saveUnit(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(unitSchema, fd);
  if (!p.success) return invalid(p.error);
  const { id, ...v } = p.data;
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("units").update(v).eq("id", id).select("id").single()
    : await supabase.from("units").insert(v).select("id").single();
  if (error) return dbFailure(error);
  revalidatePath("/configuracoes");
  return success("Unidade salva.");
}

export async function saveCompetition(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(competitionSchema, fd);
  if (!p.success) return invalid(p.error);
  const { id, ...v } = p.data;
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("competitions").update(v).eq("id", id).select("id").single()
    : await supabase.from("competitions").insert(v).select("id").single();
  if (error) return dbFailure(error);
  revalidatePath("/competicoes");
  return success("Competição salva.");
}

export async function saveCycle(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(cycleSchema, fd);
  if (!p.success) return invalid(p.error);
  const { id, ...v } = p.data;
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("cycles").update(v).eq("id", id).select("id").single()
    : await supabase.from("cycles").insert(v).select("id").single();
  if (error) return dbFailure(error);
  revalidatePath("/competicoes");
  return success("Ciclo salvo.");
}

export async function createProgram(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(programSchema, fd);
  if (!p.success) return invalid(p.error);
  const supabase = await createClient();
  const { error } = await supabase.from("programs").insert(p.data).select("id").single();
  if (error) return dbFailure(error);
  revalidatePath("/competicoes");
  return success("Programa criado.");
}

export async function updateProgramSettings(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(programSettingsSchema, fd);
  if (!p.success) return invalid(p.error);
  const supabase = await createClient();
  const { data: current, error: e1 } = await supabase.from("programs").select("settings").eq("id", p.data.id).single();
  if (e1) return dbFailure(e1);
  const settings = { ...(current.settings as Record<string, unknown>), acao_conclusao_exige: p.data.acao_conclusao_exige };
  const { error } = await supabase.from("programs").update({ status: p.data.status, settings }).eq("id", p.data.id).select("id").single();
  if (error) return dbFailure(error);
  revalidatePath(`/competicoes/${p.data.id}`);
  return success("Parâmetros do programa salvos.");
}

/** Arquivamento lógico (PRD RF02: arquivar sem apagar histórico) */
export async function setArchived(
  table: "units" | "competitions" | "cycles" | "programs" | "stages" | "occupations" | "teams" | "people",
  id: string,
  archived: boolean,
  path: string,
): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from(table)
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id)
    .select("id")
    .single();
  if (error) return dbFailure(error);
  revalidatePath(path);
  return success(archived ? "Registro arquivado (histórico preservado)." : "Registro reativado.");
}

export async function saveStage(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(stageSchema, fd);
  if (!p.success) return invalid(p.error);
  const { id, ...v } = p.data;
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("stages").update(v).eq("id", id).select("id").single()
    : await supabase.from("stages").insert(v).select("id").single();
  if (error) return dbFailure(error);
  revalidatePath(`/competicoes/${v.program_id}`);
  return success("Etapa salva.");
}

export async function saveOccupation(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(occupationSchema, fd);
  if (!p.success) return invalid(p.error);
  const { id, ...v } = p.data;
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("occupations").update(v).eq("id", id).select("id").single()
    : await supabase.from("occupations").insert(v).select("id").single();
  if (error) return dbFailure(error);
  revalidatePath(`/competicoes/${v.program_id}`);
  return success("Ocupação salva.");
}
