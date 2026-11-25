"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dbFailure, invalid, parseForm, success, type FormState } from "@/lib/forms";
import { zonedToUtc } from "@/lib/dates";
import { eventExceptionSchema, eventSchema } from "@/features/schemas";

export async function saveEvent(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(eventSchema, fd);
  if (!p.success) return invalid(p.error);
  const d = p.data;
  const starts = zonedToUtc(d.date, d.start_time);
  const ends = zonedToUtc(d.date, d.end_time);
  const row = {
    program_id: d.program_id,
    team_id: d.team_id,
    title: d.title,
    type: d.type,
    description: d.description,
    location: d.location,
    starts_at: starts.toISOString(),
    ends_at: ends.toISOString(),
    owner_person_id: d.owner_person_id,
    resource_id: d.resource_id,
    recurrence_freq: d.recurrence_freq,
    recurrence_interval: d.recurrence_freq ? d.recurrence_interval : 1,
    recurrence_weekdays: d.recurrence_freq === "semanal" && d.recurrence_weekdays.length ? d.recurrence_weekdays : null,
    recurrence_count: d.recurrence_freq && d.recurrence_end === "count" ? d.recurrence_count : null,
    recurrence_until: d.recurrence_freq && d.recurrence_end === "until" ? d.recurrence_until : null,
  };
  const supabase = await createClient();
  if (d.id) {
    const upd = Object.fromEntries(Object.entries(row).filter(([k]) => k !== "program_id")) as Omit<typeof row, "program_id">;
    const { error } = await supabase.from("events").update(upd).eq("id", d.id).select("id").single();
    if (error) return dbFailure(error);
    revalidatePath(`/agenda/${d.id}`);
    return success("Evento atualizado.");
  }
  const { data, error } = await supabase.from("events").insert(row).select("id").single();
  if (error) return dbFailure(error);
  if (d.participant_ids.length) {
    const { error: pe } = await supabase
      .from("event_participants")
      .insert(d.participant_ids.map((person_id) => ({ event_id: data.id, program_id: d.program_id, person_id })));
    if (pe) return dbFailure(pe);
  }
  revalidatePath("/agenda");
  redirect(`/agenda/${data.id}`);
}

export async function saveException(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(eventExceptionSchema, fd);
  if (!p.success) return invalid(p.error);
  const d = p.data;
  const row = {
    event_id: d.event_id,
    program_id: d.program_id,
    occurrence_start: d.occurrence_start,
    kind: d.kind,
    new_starts_at: d.kind === "alterada" ? zonedToUtc(d.new_date!, d.new_start_time!).toISOString() : null,
    new_ends_at: d.kind === "alterada" ? zonedToUtc(d.new_date!, d.new_end_time!).toISOString() : null,
    new_title: d.kind === "alterada" ? d.new_title : null,
    note: d.note,
  };
  const supabase = await createClient();
  const { error } = await supabase.from("event_exceptions").upsert(row, { onConflict: "event_id,occurrence_start" }).select("id").single();
  if (error) return dbFailure(error);
  revalidatePath(`/agenda/${d.event_id}`);
  return success(d.kind === "cancelada" ? "Ocorrência cancelada." : "Ocorrência alterada.");
}

export async function deleteException(eventId: string, exceptionId: string): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.from("event_exceptions").delete().eq("id", exceptionId).select("id").single();
  if (error) return dbFailure(error);
  revalidatePath(`/agenda/${eventId}`);
  return success("Exceção removida; a ocorrência volta ao padrão.");
}

const participantSchema = z.object({ event_id: z.uuid(), program_id: z.uuid(), person_id: z.uuid({ message: "Selecione a pessoa." }) });

export async function addParticipant(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(participantSchema, fd);
  if (!p.success) return invalid(p.error);
  const supabase = await createClient();
  const { error } = await supabase.from("event_participants").insert(p.data).select("event_id").single();
  if (error) return dbFailure(error);
  revalidatePath(`/agenda/${p.data.event_id}`);
  return success("Participante incluído.");
}

export async function removeParticipant(eventId: string, personId: string): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.from("event_participants").delete().eq("event_id", eventId).eq("person_id", personId).select("event_id").single();
  if (error) return dbFailure(error);
  revalidatePath(`/agenda/${eventId}`);
  return success("Participante removido.");
}

export async function setEventArchived(eventId: string, archived: boolean): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.from("events").update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", eventId).select("id").single();
  if (error) return dbFailure(error);
  revalidatePath(`/agenda/${eventId}`);
  revalidatePath("/agenda");
  return success(archived ? "Evento arquivado." : "Evento reativado.");
}
