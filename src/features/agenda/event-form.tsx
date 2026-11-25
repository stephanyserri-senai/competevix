import { ActionForm } from "@/components/ui/action-form";
import { SelectField, TextField, TextareaField } from "@/components/ui/field-errors";
import { zonedParts } from "@/lib/dates";
import { saveEvent } from "./actions";
import { EVENT_TYPE_LABEL, WEEKDAY_LABEL, type AgendaEvent } from "./domain";

type Opt = { id: string; name: string };

export function EventForm({
  programId,
  teams,
  people,
  event,
  allowGeneral,
  defaultDate,
  rooms = [],
}: {
  programId: string;
  teams: Opt[];
  people: Opt[];
  event?: AgendaEvent & { team_id: string | null };
  allowGeneral: boolean;
  defaultDate: string;
  /** Ambientes reserváveis da unidade (RF09) */
  rooms?: Opt[];
}) {
  const s = event ? zonedParts(event.starts_at) : null;
  const e = event ? zonedParts(event.ends_at) : null;
  const k = event?.id ?? "novo";
  return (
    <ActionForm action={saveEvent} schema="event" submitLabel={event ? "Salvar evento" : "Criar evento"} className="grid gap-4 sm:grid-cols-2">
      {event ? <input type="hidden" name="id" value={event.id} /> : null}
      <input type="hidden" name="program_id" value={programId} />
      <TextField id={`ev-title-${k}`} name="title" label="Título" defaultValue={event?.title} required className="sm:col-span-2" />
      <SelectField id={`ev-type-${k}`} name="type" label="Tipo" defaultValue={event?.type ?? "treino"}>
        {Object.entries(EVENT_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </SelectField>
      <SelectField id={`ev-team-${k}`} name="team_id" label="Equipe" defaultValue={event?.team_id ?? ""}>
        {allowGeneral ? <option value="">Geral do programa</option> : <option value="" disabled>Selecione…</option>}
        {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </SelectField>
      <TextField id={`ev-date-${k}`} name="date" type="date" label="Data (1ª ocorrência)" defaultValue={s?.date ?? defaultDate} required />
      <div className="grid grid-cols-2 gap-3">
        <TextField id={`ev-start-${k}`} name="start_time" type="time" label="Início" defaultValue={s?.time ?? "08:00"} required />
        <TextField id={`ev-end-${k}`} name="end_time" type="time" label="Término" defaultValue={e?.time ?? "12:00"} required />
      </div>
      <SelectField id={`ev-owner-${k}`} name="owner_person_id" label="Responsável" defaultValue={event?.owner_person_id ?? ""}>
        <option value="">A definir</option>
        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </SelectField>
      <TextField id={`ev-loc-${k}`} name="location" label="Local (texto livre)" defaultValue={event?.location ?? ""} />
      {rooms.length ? (
        <SelectField id={`ev-room-${k}`} name="resource_id" label="Ambiente reservado" defaultValue={event?.resource_id ?? ""} hint="Usado na detecção de conflitos de ambiente.">
          <option value="">Nenhum</option>
          {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </SelectField>
      ) : null}
      {!event ? (
        <SelectField id={`ev-part-${k}`} name="participant_ids" label="Participantes" multiple className="sm:col-span-2" hint="Ctrl/Cmd + clique para selecionar vários. Usado na detecção de conflitos.">
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </SelectField>
      ) : null}
      <fieldset className="space-y-3 rounded-md border border-slate-200 p-3 sm:col-span-2">
        <legend className="px-1 text-sm font-medium">Recorrência</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <SelectField id={`ev-freq-${k}`} name="recurrence_freq" label="Repetir" defaultValue={event?.recurrence_freq ?? ""}>
            <option value="">Não repete</option>
            <option value="diaria">Diariamente</option>
            <option value="semanal">Semanalmente</option>
            <option value="mensal">Mensalmente (mesmo dia)</option>
          </SelectField>
          <TextField id={`ev-int-${k}`} name="recurrence_interval" type="number" min={1} max={52} label="A cada (intervalo)" defaultValue={event?.recurrence_interval ?? 1} />
          <SelectField id={`ev-endk-${k}`} name="recurrence_end" label="Término da série" defaultValue={event?.recurrence_until ? "until" : "count"}>
            <option value="count">Após N ocorrências</option>
            <option value="until">Até a data</option>
          </SelectField>
          <TextField id={`ev-count-${k}`} name="recurrence_count" type="number" min={1} max={500} label="Nº de ocorrências" defaultValue={event?.recurrence_count ?? ""} />
          <TextField id={`ev-until-${k}`} name="recurrence_until" type="date" label="Repetir até" defaultValue={event?.recurrence_until ?? ""} />
        </div>
        <div>
          <p className="mb-1 text-sm font-medium">Dias da semana (recorrência semanal)</p>
          <div className="flex flex-wrap gap-3">
            {WEEKDAY_LABEL.map((d, i) => (
              <label key={d} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" name="recurrence_weekdays" value={i} defaultChecked={event?.recurrence_weekdays?.includes(i)} className="size-4" /> {d}
              </label>
            ))}
          </div>
        </div>
      </fieldset>
      <TextareaField id={`ev-desc-${k}`} name="description" label="Descrição" defaultValue={event?.description ?? ""} className="sm:col-span-2" />
    </ActionForm>
  );
}
