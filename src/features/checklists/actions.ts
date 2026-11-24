"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dbFailure, invalid, parseForm, success, type FormState } from "@/lib/forms";
import { checklistAnswerSchema, checklistItemSchema, checklistRunSchema, checklistTemplateSchema } from "@/features/schemas";

export async function createTemplate(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(checklistTemplateSchema, fd);
  if (!p.success) return invalid(p.error);
  const supabase = await createClient();
  const { data, error } = await supabase.from("checklist_templates").insert(p.data).select("id").single();
  if (error) return dbFailure(error);
  redirect(`/checklists/modelos/${data.id}`);
}

export async function addItem(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(checklistItemSchema, fd);
  if (!p.success) return invalid(p.error);
  const supabase = await createClient();
  const { data: last } = await supabase.from("checklist_items").select("position").eq("template_id", p.data.template_id).order("position", { ascending: false }).limit(1);
  const position = (last?.[0]?.position ?? -1) + 1;
  const { error } = await supabase.from("checklist_items").insert({ ...p.data, position }).select("id").single();
  if (error) return dbFailure(error);
  revalidatePath(`/checklists/modelos/${p.data.template_id}`);
  return success("Item incluído.");
}

export async function removeItem(templateId: string, itemId: string): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.from("checklist_items").delete().eq("id", itemId).select("id").single();
  if (error) return dbFailure(error);
  revalidatePath(`/checklists/modelos/${templateId}`);
  return success("Item removido.");
}

export async function publishTemplate(templateId: string): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("publish_checklist_template", { p_template: templateId });
  if (error) return dbFailure(error);
  revalidatePath(`/checklists/modelos/${templateId}`);
  revalidatePath("/checklists");
  return success("Modelo publicado. Versões anteriores da família foram substituídas.");
}

export async function newVersion(templateId: string): Promise<FormState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("new_checklist_version", { p_template: templateId });
  if (error) return dbFailure(error);
  redirect(`/checklists/modelos/${data.id}`);
}

export async function createRun(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(checklistRunSchema, fd);
  if (!p.success) return invalid(p.error);
  const supabase = await createClient();
  const { data, error } = await supabase.from("checklist_runs").insert(p.data).select("id").single();
  if (error) return dbFailure(error);
  redirect(`/checklists/${data.id}`);
}

export async function saveAnswer(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(checklistAnswerSchema, fd);
  if (!p.success) return invalid(p.error);
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const { error } = await supabase
    .from("checklist_answers")
    .upsert({ ...p.data, answered_by: claims?.claims?.sub }, { onConflict: "run_id,item_id" })
    .select("id")
    .single();
  if (error) return dbFailure(error);
  revalidatePath(`/checklists/${p.data.run_id}`);
  return success("Resposta salva.");
}

export async function completeRun(runId: string): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_checklist_run", { p_run: runId });
  if (error) return dbFailure(error);
  revalidatePath(`/checklists/${runId}`);
  revalidatePath("/checklists");
  return success("Checklist concluído. As respostas agora são imutáveis.");
}
