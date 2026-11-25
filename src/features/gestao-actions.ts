"use server";

/* Etapa 4 — Server Actions de recursos, orçamento, benchmarking e riscos.
 * Sempre com a sessão do usuário: RLS e gatilhos do banco são a autoridade. */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { dbFailure, invalid, parseForm, success, type FormState } from "@/lib/forms";
import {
  benchmarkSchema, budgetItemSchema, budgetTxSchema, cancelTxSchema, derivedActionSchema, movementSchema, requestStatusSchema,
  resourceRequestSchema, resourceSchema, riskReviewSchema, riskSchema,
} from "@/features/schemas";

export async function saveResource(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(resourceSchema, fd);
  if (!p.success) return invalid(p.error);
  const { id, ...v } = p.data;
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("resources").update(v).eq("id", id).select("id").single()
    : await supabase.from("resources").insert(v).select("id").single();
  if (error) return dbFailure(error);
  revalidatePath("/recursos");
  return success("Recurso salvo.");
}

export async function createRequest(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(resourceRequestSchema, fd);
  if (!p.success) return invalid(p.error);
  const supabase = await createClient();
  const { error } = await supabase.from("resource_requests").insert(p.data).select("id").single();
  if (error) return dbFailure(error);
  revalidatePath("/recursos");
  return success("Solicitação criada em rascunho. Envie quando estiver pronta.");
}

export async function changeRequestStatus(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(requestStatusSchema, fd);
  if (!p.success) return invalid(p.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_request_status", { p_request: p.data.id, p_status: p.data.status, p_note: p.data.note ?? undefined });
  if (error) return dbFailure(error);
  revalidatePath("/recursos");
  return success("Solicitação atualizada.");
}

export async function addMovement(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(movementSchema, fd);
  if (!p.success) return invalid(p.error);
  const supabase = await createClient();
  const { error } = await supabase.from("resource_movements").insert(p.data).select("id").single();
  if (error) return dbFailure(error);
  revalidatePath("/recursos");
  return success("Movimentação registrada.");
}

export async function saveBudgetItem(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(budgetItemSchema, fd);
  if (!p.success) return invalid(p.error);
  const supabase = await createClient();
  const { error } = await supabase.from("budget_items").insert(p.data).select("id").single();
  if (error) return dbFailure(error);
  revalidatePath("/orcamento");
  return success("Item orçamentário criado.");
}

export async function addBudgetTx(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(budgetTxSchema, fd);
  if (!p.success) return invalid(p.error);
  const supabase = await createClient();
  const { error } = await supabase.from("budget_transactions").insert(p.data).select("id").single();
  if (error) return dbFailure(error);
  revalidatePath("/orcamento");
  return success("Lançamento registrado.");
}

export async function cancelBudgetTx(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(cancelTxSchema, fd);
  if (!p.success) return invalid(p.error);
  const supabase = await createClient();
  const { error } = await supabase
    .from("budget_transactions")
    .update({ cancelled_at: new Date().toISOString(), cancel_note: p.data.cancel_note })
    .eq("id", p.data.id)
    .select("id")
    .single();
  if (error) return dbFailure(error);
  revalidatePath("/orcamento");
  return success("Lançamento cancelado (mantido no histórico).");
}

export async function saveBenchmark(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(benchmarkSchema, fd);
  if (!p.success) return invalid(p.error);
  const { id, ...v } = p.data;
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("benchmarks").update(v).eq("id", id).select("id").single()
    : await supabase.from("benchmarks").insert(v).select("id").single();
  if (error) return dbFailure(error);
  revalidatePath("/benchmarking");
  return success("Benchmarking salvo.");
}

/** Cria a ação no módulo de Ações e a vincula ao benchmarking (ação derivada). */
export async function deriveAction(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(derivedActionSchema, fd);
  if (!p.success) return invalid(p.error);
  const supabase = await createClient();
  const { data: b } = await supabase.from("benchmarks").select("reference").eq("id", p.data.benchmark_id).single();
  const { data, error } = await supabase
    .from("actions")
    .insert({ program_id: p.data.program_id, title: p.data.title, due_date: p.data.due_date, origin: `Benchmarking: ${b?.reference ?? ""}`.slice(0, 200) })
    .select("id")
    .single();
  if (error) return dbFailure(error);
  const { error: e2 } = await supabase.from("benchmark_actions").insert({ benchmark_id: p.data.benchmark_id, action_id: data.id, program_id: p.data.program_id });
  if (e2) return dbFailure(e2);
  revalidatePath("/benchmarking");
  return success("Ação derivada criada em Ações.");
}

export async function saveRisk(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(riskSchema, fd);
  if (!p.success) return invalid(p.error);
  const supabase = await createClient();
  const { error } = await supabase.from("risks").insert(p.data).select("id").single();
  if (error) return dbFailure(error);
  revalidatePath("/riscos");
  return success("Risco registrado.");
}

export async function reviewRisk(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(riskReviewSchema, fd);
  if (!p.success) return invalid(p.error);
  const supabase = await createClient();
  if (p.data.mitigation !== null || p.data.next_review !== null) {
    const { error: e0 } = await supabase.from("risks").update({ mitigation: p.data.mitigation, next_review: p.data.next_review }).eq("id", p.data.id).select("id").single();
    if (e0) return dbFailure(e0);
  }
  const { error } = await supabase.rpc("review_risk", {
    p_risk: p.data.id, p_probability: p.data.probability, p_impact: p.data.impact, p_status: p.data.status, p_note: p.data.note,
  });
  if (error) return dbFailure(error);
  revalidatePath("/riscos");
  return success("Reavaliação registrada no histórico.");
}
