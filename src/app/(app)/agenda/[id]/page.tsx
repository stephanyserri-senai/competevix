import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionForm } from "@/components/ui/action-form";
import { SelectField, TextField } from "@/components/ui/field-errors";
import { RunButton } from "@/components/ui/run-button";
import { ArchiveButton } from "@/components/ui/archive-button";
import { hasRole, requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, formatTime, zonedParts } from "@/lib/dates";
import { listPeopleOptions } from "@/features/equipes/queries";
import { EVENT_TYPE_LABEL, WEEKDAY_LABEL, expandOccurrences, type AgendaEvent } from "@/features/agenda/domain";
import { addParticipant, deleteException, removeParticipant, saveException, setEventArchived } from "@/features/agenda/actions";
import { EventForm } from "@/features/agenda/event-form";
import { programLabel, PROGRAM_SELECT } from "@/features/programas/queries";

function describeRecurrence(e: AgendaEvent) {
  if (!e.recurrence_freq) return "Evento único";
  const every = e.recurrence_interval > 1 ? ` a cada ${e.recurrence_interval}` : "";
  const base = { diaria: `Diário${every ? `${every} dias` : ""}`, semanal: `Semanal${every ? `${every} semanas` : ""}`, mensal: `Mensal${every ? `${every} meses` : ""}` }[e.recurrence_freq];
  const days = e.recurrence_freq === "semanal" && e.recurrence_weekdays?.length ? ` (${e.recurrence_weekdays.map((d) => WEEKDAY_LABEL[d]).join(", ")})` : "";
  const end = e.recurrence_count ? `, ${e.recurrence_count} ocorrências` : e.recurrence_until ? `, até ${formatDate(e.recurrence_until)}` : "";
  return base + days + end;
}

export default async function EventoPage({ params }: PageProps<"/agenda/[id]">) {
  const { id } = await params;
  const access = await requireAccess();
  const supabase = await createClient();
  const { data: ev } = await supabase.from("events").select("*, participants:event_participants(person_id, person:people(full_name))").eq("id", id).maybeSingle();
  if (!ev) notFound();

  const [{ data: program }, { data: exceptions }, { data: teams }, people] = await Promise.all([
    supabase.from("programs").select(PROGRAM_SELECT).eq("id", ev.program_id).single(),
    supabase.from("event_exceptions").select("*").eq("event_id", id).order("occurrence_start"),
    supabase.from("teams").select("id, name").eq("program_id", ev.program_id).is("archived_at", null).order("name"),
    listPeopleOptions(supabase),
  ]);
  const event: AgendaEvent = { ...ev, participant_ids: ev.participants.map((p) => p.person_id) };
  const canEdit = hasRole(access, ev.program_id, "supervisao") || (hasRole(access, ev.program_id, "orientador") && Boolean(ev.team_id));
  const now = new Date();
  const upcoming = ev.recurrence_freq
    ? expandOccurrences({ ...event }, [], new Date(now.getTime() - 7 * 86400000), new Date(now.getTime() + 120 * 86400000)).slice(0, 12)
    : [];
  const excByKey = new Map((exceptions ?? []).map((x) => [new Date(x.occurrence_start).getTime(), x]));
  const owner = people.find((p) => p.id === ev.owner_person_id)?.full_name;
  const team = (teams ?? []).find((t) => t.id === ev.team_id)?.name;
  const participantIds = new Set(event.participant_ids);

  return (
    <>
      <PageHeader
        eyebrow={program ? programLabel(program) : undefined}
        title={ev.title}
        description={`${EVENT_TYPE_LABEL[ev.type]} · ${describeRecurrence(event)}`}
        actions={
          <>
            <Link href={`/agenda?programa=${ev.program_id}&data=${zonedParts(ev.starts_at).date}`} className="text-sm text-brand-700 hover:underline">← Voltar à agenda</Link>
            {canEdit ? <ArchiveButton archived={Boolean(ev.archived_at)} onToggle={setEventArchived.bind(null, id, !ev.archived_at)} /> : null}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Detalhes" />
            <CardBody>
              <dl className="grid gap-3 text-sm sm:grid-cols-3">
                <div><dt className="text-slate-600">Primeira ocorrência</dt><dd className="font-medium">{formatDateTime(ev.starts_at)} – {formatTime(ev.ends_at)}</dd></div>
                <div><dt className="text-slate-600">Equipe</dt><dd className="font-medium">{team ?? "Geral do programa"}</dd></div>
                <div><dt className="text-slate-600">Responsável</dt><dd className="font-medium">{owner ?? "A definir"}</dd></div>
                <div><dt className="text-slate-600">Local</dt><dd className="font-medium">{ev.location ?? "—"}</dd></div>
              </dl>
              {ev.description ? <p className="mt-4 whitespace-pre-line text-sm">{ev.description}</p> : null}
            </CardBody>
          </Card>

          {ev.recurrence_freq ? (
            <Card>
              <CardHeader title="Próximas ocorrências" description="Cancele ou altere ocorrências específicas sem mudar a série." />
              <CardBody>
                <ul className="divide-y divide-slate-100">
                  {upcoming.map((o) => {
                    const exc = excByKey.get(o.start.getTime());
                    const local = zonedParts(o.start);
                    return (
                      <li key={o.key} className="py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-medium">
                            {formatDate(local.date)} · {formatTime(o.start)}–{formatTime(o.end)}
                            {exc ? <Badge tone={exc.kind === "cancelada" ? "danger" : "warning"} className="ml-2">{exc.kind === "cancelada" ? "Cancelada" : `Alterada para ${formatDateTime(exc.new_starts_at)}`}</Badge> : null}
                          </p>
                          {canEdit && exc ? <RunButton label="Desfazer exceção" onRun={deleteException.bind(null, id, exc.id)} /> : null}
                        </div>
                        {canEdit && !exc ? (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-sm text-brand-700">Cancelar ou alterar esta ocorrência</summary>
                            <ActionForm action={saveException} schema="eventException" submitLabel="Registrar exceção" className="mt-3 grid gap-3 sm:grid-cols-4">
                              <input type="hidden" name="event_id" value={id} />
                              <input type="hidden" name="program_id" value={ev.program_id} />
                              <input type="hidden" name="occurrence_start" value={o.key} />
                              <SelectField id={`k-${o.key}`} name="kind" label="Tipo" defaultValue="cancelada">
                                <option value="cancelada">Cancelar</option>
                                <option value="alterada">Alterar horário</option>
                              </SelectField>
                              <TextField id={`d-${o.key}`} name="new_date" type="date" label="Nova data" defaultValue={local.date} />
                              <TextField id={`s-${o.key}`} name="new_start_time" type="time" label="Novo início" defaultValue={local.time} />
                              <TextField id={`e-${o.key}`} name="new_end_time" type="time" label="Novo término" defaultValue={zonedParts(o.end).time} />
                              <TextField id={`n-${o.key}`} name="note" label="Motivo" className="sm:col-span-4" />
                            </ActionForm>
                          </details>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </CardBody>
            </Card>
          ) : null}

          {canEdit ? (
            <Card>
              <CardHeader title="Editar evento" description="Alterações valem para toda a série; exceções já registradas são mantidas." />
              <CardBody>
                <EventForm
                  programId={ev.program_id}
                  teams={(teams ?? []).map((t) => ({ id: t.id, name: t.name }))}
                  people={people.map((p) => ({ id: p.id, name: p.full_name }))}
                  event={event as AgendaEvent & { team_id: string | null }}
                  allowGeneral={hasRole(access, ev.program_id, "supervisao")}
                  defaultDate={zonedParts(ev.starts_at).date}
                />
              </CardBody>
            </Card>
          ) : null}
        </div>

        <Card>
          <CardHeader title="Participantes" description="Usados na detecção de conflitos." />
          <CardBody className="space-y-3">
            {ev.participants.length === 0 ? <p className="text-sm text-slate-600">Nenhum participante.</p> : (
              <ul className="space-y-1">
                {ev.participants.map((p) => (
                  <li key={p.person_id} className="flex items-center justify-between text-sm">
                    {p.person?.full_name ?? "Pessoa fora do seu escopo"}
                    {canEdit ? <RunButton label="Remover" onRun={removeParticipant.bind(null, id, p.person_id)} /> : null}
                  </li>
                ))}
              </ul>
            )}
            {canEdit ? (
              <ActionForm action={addParticipant} submitLabel="Incluir" submitVariant="secondary" resetOnSuccess>
                <input type="hidden" name="event_id" value={id} />
                <input type="hidden" name="program_id" value={ev.program_id} />
                <SelectField name="person_id" label="Pessoa" defaultValue="">
                  <option value="" disabled>Selecione…</option>
                  {people.filter((p) => !participantIds.has(p.id)).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </SelectField>
              </ActionForm>
            ) : null}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
