"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dbFailure, invalid, parseForm, success, type FormState } from "@/lib/forms";
import {
  actionSchema, actionStatusSchema, backlogImportSchema, commentSchema, dependencySchema, evidenceLinkSchema,
} from "@/features/schemas";
import { BACKLOG_ORIGIN, BACKLOG_REUNIAO_2026_11_24 } from "./backlog-reuniao";

export async function saveAction(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(actionSchema, fd);
  if (!p.success) return invalid(p.error);
  const { id, ...v } = p.data;
  const supabase = await createClient();
  if (id) {
    // program_id é imutável (trigger); não é enviado na atualização
    const upd = Object.fromEntries(Object.entries(v).filter(([k]) => k !== "program_id")) as Omit<typeof v, "program_id">;
    const { error } = await supabase.from("actions").update(upd).eq("id", id).select("id").single();
    if (error) return dbFailure(error);
    revalidatePath(`/acoes/${id}`);
    return success("Ação atualizada.");
  }
  const { data, error } = await supabase.from("actions").insert(v).select("id").single();
  if (error) return dbFailure(error);
  revalidatePath("/acoes");
  redirect(`/acoes/${data.id}`);
}

/** Mudança de status via RPC transacional (justificativa vai para o histórico). */
export async function changeActionStatus(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(actionStatusSchema, fd);
  if (!p.success) return invalid(p.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_action_status", { p_action: p.data.id, p_status: p.data.status, p_note: p.data.note ?? undefined });
  if (error) return dbFailure(error);
  revalidatePath(`/acoes/${p.data.id}`);
  revalidatePath("/acoes");
  return success("Status atualizado.");
}

export async function addDependency(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(dependencySchema, fd);
  if (!p.success) return invalid(p.error);
  const supabase = await createClient();
  const { error } = await supabase.from("action_dependencies").insert(p.data).select("action_id").single();
  if (error) return dbFailure(error);
  revalidatePath(`/acoes/${p.data.action_id}`);
  return success("Dependência adicionada.");
}

export async function removeDependency(actionId: string, dependsOn: string): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.from("action_dependencies").delete().eq("action_id", actionId).eq("depends_on_id", dependsOn).select("action_id").single();
  if (error) return dbFailure(error);
  revalidatePath(`/acoes/${actionId}`);
  return success("Dependência removida.");
}

export async function addEvidenceLink(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(evidenceLinkSchema, fd);
  if (!p.success) return invalid(p.error);
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const { error } = await supabase
    .from("action_evidences")
    .insert({ ...p.data, created_by: claims?.claims?.sub })
    .select("id")
    .single();
  if (error) return dbFailure(error);
  revalidatePath(`/acoes/${p.data.action_id}`);
  return success("Evidência registrada.");
}

export async function addComment(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(commentSchema, fd);
  if (!p.success) return invalid(p.error);
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const { error } = await supabase
    .from("action_history")
    .insert({ action_id: p.data.action_id, program_id: p.data.program_id, kind: "comentario", note: p.data.note, actor: claims?.claims?.sub })
    .select("id")
    .single();
  if (error) return dbFailure(error);
  revalidatePath(`/acoes/${p.data.action_id}`);
  return success("Comentário registrado.");
}

/**
 * Importa um grupo do backlog da reunião de 24/11/2026 para o programa escolhido.
 * Idempotente (origin_key única por programa); sem responsáveis e sem prazos inventados.
 */
export async function importBacklog(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(backlogImportSchema, fd);
  if (!p.success) return invalid(p.error);
  const group = BACKLOG_REUNIAO_2026_11_24[p.data.group];
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("actions")
    .select("origin_key")
    .eq("program_id", p.data.program_id)
    .in("origin_key", group.items.map((i) => i.key));
  const have = new Set((existing ?? []).map((e) => e.origin_key));
  const rows = group.items
    .filter((i) => !have.has(i.key))
    .map((i) => ({
      program_id: p.data.program_id,
      title: i.title,
      description: i.description ?? null,
      start_date: i.start_date ?? null,
      due_date: i.due_date ?? null,
      origin: BACKLOG_ORIGIN,
      origin_key: i.key,
      priority: "media" as const,
    }));
  if (rows.length === 0) return success("Todos os itens deste grupo já estavam cadastrados neste programa.");
  const { error } = await supabase.from("actions").insert(rows).select("id");
  if (error) return dbFailure(error);
  revalidatePath("/acoes");
  return success(`${rows.length} ação(ões) importada(s) como abertas, sem responsável definido.`);
}
