"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dbFailure, invalid, parseForm, success, type FormState } from "@/lib/forms";
import { calendarDaySchema } from "@/features/schemas";
import { nationalHolidays } from "./domain";

export async function addCalendarDay(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(calendarDaySchema, fd);
  if (!p.success) return invalid(p.error);
  const supabase = await createClient();
  const { error } = await supabase.from("calendar_days").insert(p.data).select("id").single();
  if (error) return dbFailure(error);
  revalidatePath("/configuracoes");
  return success("Dia registrado no calendário.");
}

export async function removeCalendarDay(id: string): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.from("calendar_days").delete().eq("id", id).select("id").single();
  if (error) return dbFailure(error);
  revalidatePath("/configuracoes");
  return success("Dia removido.");
}

/** Carrega feriados nacionais do ano (globais). Idempotente: datas já cadastradas são mantidas. */
export async function loadNationalHolidays(_: FormState, fd: FormData): Promise<FormState> {
  const year = z.coerce.number().int().min(2024).max(2035).safeParse(fd.get("year"));
  if (!year.success) return { ok: false, message: "Ano inválido (2024–2035).", at: Date.now() };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("calendar_days").select("day").is("unit_id", null).gte("day", `${year.data}-01-01`).lte("day", `${year.data}-12-31`);
  const have = new Set((existing ?? []).map((d) => d.day));
  const rows = nationalHolidays(year.data).filter((h) => !have.has(h.day)).map((h) => ({ unit_id: null, day: h.day, kind: "feriado_nacional" as const, description: h.description, source: h.source, affects_ch: true }));
  if (!rows.length) return success("Os feriados nacionais deste ano já estavam cadastrados.");
  const { error } = await supabase.from("calendar_days").insert(rows).select("id");
  if (error) return dbFailure(error);
  revalidatePath("/configuracoes");
  return success(`${rows.length} feriado(s) nacional(is) de ${year.data} cadastrado(s). Inclua os estaduais, municipais e recessos.`);
}
