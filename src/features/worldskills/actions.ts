"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dbFailure, invalid, parseForm, success, type FormState } from "@/lib/forms";
import { zonedToUtc } from "@/lib/dates";
import {
  allocationSchema, assessmentSchema, attendanceSchema, competencySchema, errorSchema, itemStatusSchema, planVersionSchema,
  reportStatusSchema, resultSchema, scoreTargetSchema, sessionSchema, trainingItemSchema, trainingPlanSchema, weeklyReportSchema,
} from "@/features/schemas";

/* Todas as escritas usam a sessão do usuário: o RLS e os gatilhos do banco decidem. */

export async function saveAllocation(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(allocationSchema, fd);
  if (!p.success) return invalid(p.error);
  const { base_weekly_hours, ...v } = p.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("allocations")
    .insert({ ...v, base_weekly_minutes: Math.round(base_weekly_hours * 60) })
    .select("id")
    .single();
  if (error) return dbFailure(error);
  revalidatePath("/worldskills");
  return success("Alocação registrada.");
}

export async function endAllocation(id: string, validTo: string): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.from("allocations").update({ valid_to: validTo }).eq("id", id).select("id").single();
  if (error) return dbFailure(error);
  revalidatePath("/worldskills");
  return success("Vigência encerrada.");
}

export async function saveCompetency(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(competencySchema, fd);
  if (!p.success) return invalid(p.error);
  const { id, ...v } = p.data;
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("competencies").update(v).eq("id", id).select("id").single()
    : await supabase.from("competencies").insert(v).select("id").single();
  if (error) return dbFailure(error);
  revalidatePath("/worldskills");
  return success("Competência salva.");
}

export async function createPlan(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(trainingPlanSchema, fd);
  if (!p.success) return invalid(p.error);
  const supabase = await createClient();
  const { data, error } = await supabase.from("training_plans").insert(p.data).select("id").single();
  if (error) return dbFailure(error);
  redirect(`/worldskills/planos/${data.id}`);
}

export async function addPlanItem(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(trainingItemSchema, fd);
  if (!p.success) return invalid(p.error);
  const supabase = await createClient();
  const { error } = await supabase.from("training_items").insert(p.data).select("id").single();
  if (error) return dbFailure(error);
  revalidatePath(`/worldskills/planos/${p.data.plan_id}`);
  return success("Item incluído.");
}

export async function removePlanItem(planId: string, itemId: string): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.from("training_items").delete().eq("id", itemId).select("id").single();
  if (error) return dbFailure(error);
  revalidatePath(`/worldskills/planos/${planId}`);
  return success("Item removido.");
}

export async function setItemStatus(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(itemStatusSchema, fd);
  if (!p.success) return invalid(p.error);
  const supabase = await createClient();
  const { error } = await supabase
    .from("training_items")
    .update({ status: p.data.status, status_note: p.data.status_note })
    .eq("id", p.data.id)
    .select("id")
    .single();
  if (error) return dbFailure(error);
  revalidatePath(`/worldskills/planos/${p.data.plan_id}`);
  return success("Execução registrada.");
}

export async function publishPlan(planId: string): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("publish_training_plan", { p_plan: planId });
  if (error) return dbFailure(error);
  revalidatePath(`/worldskills/planos/${planId}`);
  return success("Plano publicado; versões anteriores substituídas.");
}

export async function newPlanVersion(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(planVersionSchema, fd);
  if (!p.success) return invalid(p.error);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("new_training_plan_version", { p_plan: p.data.id, p_note: p.data.note });
  if (error) return dbFailure(error);
  redirect(`/worldskills/planos/${data.id}`);
}

export async function createSession(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(sessionSchema, fd);
  if (!p.success) return invalid(p.error);
  const d = p.data;
  const starts = zonedToUtc(d.date, d.start_time);
  const ends = zonedToUtc(d.date, d.end_time);
  const actual = Math.round((ends.getTime() - starts.getTime()) / 60000) - d.break_minutes;
  if (actual <= 0) return { ok: false, message: "Pausa maior ou igual à duração da sessão.", at: Date.now() };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("training_sessions")
    .insert({
      program_id: d.program_id, team_id: d.team_id, training_item_id: d.training_item_id, competency_id: d.competency_id,
      starts_at: starts.toISOString(), ends_at: ends.toISOString(), actual_minutes: actual, location: d.location, notes: d.notes,
    })
    .select("id")
    .single();
  if (error) return dbFailure(error);
  redirect(`/worldskills/sessoes/${data.id}`);
}

export async function saveAttendance(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(attendanceSchema, fd);
  if (!p.success) return invalid(p.error);
  const d = p.data;
  const supabase = await createClient();
  let minutes = d.attended_minutes ?? 0;
  if (d.status === "presente") {
    const { data: s } = await supabase.from("training_sessions").select("actual_minutes").eq("id", d.session_id).single();
    minutes = s?.actual_minutes ?? 0;
  }
  if (d.status === "ausente" || d.status === "justificada") minutes = 0;
  const { error } = await supabase
    .from("attendance")
    .upsert({ session_id: d.session_id, program_id: d.program_id, person_id: d.person_id, status: d.status, attended_minutes: minutes, justification: d.justification }, { onConflict: "session_id,person_id" })
    .select("session_id")
    .single();
  if (error) return dbFailure(error);
  revalidatePath(`/worldskills/sessoes/${d.session_id}`);
  return success("Presença registrada.");
}

export async function createAssessment(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(assessmentSchema, fd);
  if (!p.success) return invalid(p.error);
  const supabase = await createClient();
  const { data, error } = await supabase.from("assessments").insert(p.data).select("id").single();
  if (error) return dbFailure(error);
  redirect(`/worldskills/simulados/${data.id}`);
}

export async function addResult(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(resultSchema, fd);
  if (!p.success) return invalid(p.error);
  const supabase = await createClient();
  const { error } = await supabase.from("assessment_results").insert(p.data).select("id").single();
  if (error) return dbFailure(error);
  revalidatePath(`/worldskills/simulados/${p.data.assessment_id}`);
  return success("Nota registrada.");
}

export async function removeResult(assessmentId: string, resultId: string): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.from("assessment_results").delete().eq("id", resultId).select("id").single();
  if (error) return dbFailure(error);
  revalidatePath(`/worldskills/simulados/${assessmentId}`);
  return success("Nota removida.");
}

export async function publishAssessment(assessmentId: string): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("publish_assessment", { p_assessment: assessmentId });
  if (error) return dbFailure(error);
  revalidatePath(`/worldskills/simulados/${assessmentId}`);
  return success("Simulado publicado; notas congeladas.");
}

export async function saveAssessmentError(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(errorSchema, fd);
  if (!p.success) return invalid(p.error);
  const { id, ...v } = p.data;
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("assessment_errors").update(v).eq("id", id).select("id").single()
    : await supabase.from("assessment_errors").insert(v).select("id").single();
  if (error) return dbFailure(error);
  revalidatePath(`/worldskills/simulados/${v.assessment_id}`);
  return success("Análise de erro salva.");
}

export async function saveScoreTarget(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(scoreTargetSchema, fd);
  if (!p.success) return invalid(p.error);
  const { month, ...v } = p.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("score_targets")
    .upsert({ ...v, month: `${month}-01` }, { onConflict: "occupation_id,month,scale" })
    .select("id")
    .single();
  if (error) return dbFailure(error);
  revalidatePath("/worldskills");
  return success("Meta da rampa salva.");
}

export async function saveWeeklyReport(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(weeklyReportSchema, fd);
  if (!p.success) return invalid(p.error);
  const { id, planned_hours, actual_hours, ...v } = p.data;
  const row = { ...v, planned_minutes: Math.round(planned_hours * 60), actual_minutes: Math.round(actual_hours * 60) };
  const supabase = await createClient();
  if (id) {
    const { error } = await supabase
      .from("weekly_reports")
      .update({ planned_minutes: row.planned_minutes, actual_minutes: row.actual_minutes, outcomes: row.outcomes, blockers: row.blockers, intervention: row.intervention, next_steps: row.next_steps })
      .eq("id", id)
      .select("id")
      .single();
    if (error) return dbFailure(error);
    revalidatePath(`/acompanhamentos/${id}`);
    return success("Relatório salvo.");
  }
  const { data, error } = await supabase.from("weekly_reports").insert(row).select("id").single();
  if (error) return dbFailure(error);
  redirect(`/acompanhamentos/${data.id}`);
}

export async function changeReportStatus(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(reportStatusSchema, fd);
  if (!p.success) return invalid(p.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_weekly_report_status", { p_report: p.data.id, p_status: p.data.status, p_note: p.data.note ?? undefined });
  if (error) return dbFailure(error);
  revalidatePath(`/acompanhamentos/${p.data.id}`);
  revalidatePath("/acompanhamentos");
  return success("Situação do relatório atualizada.");
}

export async function correctReport(reportId: string): Promise<FormState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("correct_weekly_report", { p_report: reportId });
  if (error) return dbFailure(error);
  redirect(`/acompanhamentos/${data.id}`);
}
