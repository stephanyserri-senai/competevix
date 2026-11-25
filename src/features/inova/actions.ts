"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dbFailure, invalid, parseForm, success, type FormState } from "@/lib/forms";
import {
  advanceSchema, assignmentSchema, criterionSchema, panelSchema, projectEvidenceSchema, projectResultSchema, projectSchema, reviseSchema,
} from "@/features/schemas";

export async function saveProject(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(projectSchema, fd);
  if (!p.success) return invalid(p.error);
  const { id, ...v } = p.data;
  const supabase = await createClient();
  if (id) {
    const { program_id: _p, team_id: _t, ...upd } = v;
    void _p; void _t;
    const { error } = await supabase.from("projects").update(upd).eq("id", id).select("id").single();
    if (error) return dbFailure(error);
    revalidatePath(`/inova/projetos/${id}`);
    return success("Ficha do projeto salva.");
  }
  const { data, error } = await supabase.from("projects").insert(v).select("id").single();
  if (error) return dbFailure(error);
  redirect(`/inova/projetos/${data.id}`);
}

export async function addProjectEvidence(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(projectEvidenceSchema, fd);
  if (!p.success) return invalid(p.error);
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const { error } = await supabase
    .from("project_evidences")
    .insert({ ...p.data, created_by: claims?.claims?.sub })
    .select("id")
    .single();
  if (error) return dbFailure(error);
  revalidatePath(`/inova/projetos/${p.data.project_id}`);
  return success("Evidência registrada na etapa atual.");
}

export async function advanceStage(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(advanceSchema, fd);
  if (!p.success) return invalid(p.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("advance_project_stage", { p_project: p.data.project_id, p_to: p.data.to_stage, p_note: p.data.note ?? undefined });
  if (error) return dbFailure(error);
  revalidatePath(`/inova/projetos/${p.data.project_id}`);
  revalidatePath("/inova");
  return success("Etapa atualizada e registrada no histórico.");
}

export async function setProjectArchived(id: string, archived: boolean): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.from("projects").update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", id).select("id").single();
  if (error) return dbFailure(error);
  revalidatePath(`/inova/projetos/${id}`);
  return success(archived ? "Projeto arquivado." : "Projeto reativado.");
}

export async function createPanel(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(panelSchema, fd);
  if (!p.success) return invalid(p.error);
  const supabase = await createClient();
  const { data, error } = await supabase.from("panels").insert(p.data).select("id").single();
  if (error) return dbFailure(error);
  // Simulação interna: quem cria já pontua (sem avaliador externo — decisão 25/11/2026)
  const { data: claims } = await supabase.auth.getClaims();
  await supabase.from("panel_assignments").insert({ panel_id: data.id, program_id: p.data.program_id, evaluator_id: claims?.claims?.sub as string });
  redirect(`/inova/bancas/${data.id}`);
}

export async function saveProjectResult(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(projectResultSchema, fd);
  if (!p.success) return invalid(p.error);
  const supabase = await createClient();
  const { error } = await supabase.from("project_results").insert(p.data).select("id").single();
  if (error) return dbFailure(error);
  revalidatePath(`/inova/projetos/${p.data.project_id}`);
  revalidatePath("/inova");
  return success("Resultado do evento registrado.");
}

export async function addAssignment(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(assignmentSchema, fd);
  if (!p.success) return invalid(p.error);
  const supabase = await createClient();
  const { error } = await supabase.from("panel_assignments").insert(p.data).select("id").single();
  if (error) return dbFailure(error);
  revalidatePath(`/inova/bancas/${p.data.panel_id}`);
  return success("Pessoa incluída na simulação.");
}

export async function removeAssignment(panelId: string, assignmentId: string): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.from("panel_assignments").delete().eq("id", assignmentId).select("id").single();
  if (error) return dbFailure(error);
  revalidatePath(`/inova/bancas/${panelId}`);
  return success("Designação removida.");
}

export async function publishPanel(panelId: string): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("publish_panel", { p_panel: panelId });
  if (error) return dbFailure(error);
  revalidatePath(`/inova/bancas/${panelId}`);
  return success("Simulação concluída; notas congeladas.");
}

export async function revisePanel(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(reviseSchema, fd);
  if (!p.success) return invalid(p.error);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("revise_panel", { p_panel: p.data.id, p_note: p.data.note });
  if (error) return dbFailure(error);
  redirect(`/inova/bancas/${data.id}`);
}

/** Avaliador salva notas (todas de uma vez) e, se pedir, envia a avaliação. */
export async function saveScores(_: FormState, fd: FormData): Promise<FormState> {
  const assignment = z.uuid().safeParse(fd.get("assignment_id"));
  const program = z.uuid().safeParse(fd.get("program_id"));
  const panel = z.uuid().safeParse(fd.get("panel_id"));
  if (!assignment.success || !program.success || !panel.success) return { ok: false, message: "Dados inválidos.", at: Date.now() };
  const rows: { assignment_id: string; program_id: string; criterion_id: string; score: number; comment: string | null }[] = [];
  const fieldErrors: Record<string, string[]> = {};
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith("score_") || typeof v !== "string" || v.trim() === "") continue;
    const criterion = k.slice(6);
    const n = Number(v.replace(",", "."));
    if (!z.uuid().safeParse(criterion).success || !Number.isFinite(n) || n < 0) {
      fieldErrors[k] = ["Nota inválida."];
      continue;
    }
    const comment = String(fd.get(`comment_${criterion}`) ?? "").trim().slice(0, 2000) || null;
    rows.push({ assignment_id: assignment.data, program_id: program.data, criterion_id: criterion, score: n, comment });
  }
  if (Object.keys(fieldErrors).length) return { ok: false, message: "Revise as notas destacadas.", fieldErrors, at: Date.now() };
  const supabase = await createClient();
  if (rows.length) {
    const { error } = await supabase.from("panel_scores").upsert(rows, { onConflict: "assignment_id,criterion_id" }).select("criterion_id");
    if (error) return dbFailure(error);
  }
  if (fd.get("acao") === "enviar") {
    const { error } = await supabase.rpc("submit_panel_evaluation", { p_assignment: assignment.data, p_comment: String(fd.get("general_comment") ?? "") || undefined });
    if (error) return dbFailure(error);
    revalidatePath(`/inova/bancas/${panel.data}`);
    return success("Avaliação concluída. As notas agora estão congeladas.");
  }
  revalidatePath(`/inova/bancas/${panel.data}`);
  return success(`${rows.length} nota(s) salva(s). Conclua quando todos os critérios estiverem pontuados.`);
}

export async function addCriterion(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(criterionSchema, fd);
  if (!p.success) return invalid(p.error);
  const supabase = await createClient();
  const { error } = await supabase.from("rubric_criteria").insert(p.data).select("id").single();
  if (error) return dbFailure(error);
  revalidatePath("/inova");
  return success("Critério incluído.");
}

export async function removeCriterion(id: string): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.from("rubric_criteria").delete().eq("id", id).select("id").single();
  if (error) return dbFailure(error);
  revalidatePath("/inova");
  return success("Critério removido.");
}

export async function publishRubric(versionId: string): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("publish_rubric_version", { p_version: versionId });
  if (error) return dbFailure(error);
  revalidatePath("/inova");
  return success("Rubrica publicada; a versão anterior foi substituída.");
}

export async function newRubricVersion(versionId: string): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("new_rubric_version", { p_version: versionId });
  if (error) return dbFailure(error);
  revalidatePath("/inova");
  return success("Nova versão em rascunho criada (cópia dos critérios).");
}
