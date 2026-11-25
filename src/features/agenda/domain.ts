/**
 * Regras puras da agenda (RF04): expansão de recorrência no fuso institucional,
 * aplicação de exceções, detecção de conflitos e exportação iCalendar (RFC 5545).
 */
import {
  TZ,
  addDays,
  addMonths,
  startOfWeek,
  weekday,
  zonedParts,
  zonedToUtc,
  type LocalDate,
} from "@/lib/dates";

export type RecurrenceFreq = "diaria" | "semanal" | "mensal";

export type AgendaEvent = {
  id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  type?: string;
  starts_at: string;
  ends_at: string;
  all_day?: boolean;
  team_id?: string | null;
  owner_person_id?: string | null;
  /** Ambiente reservado (RF09) — entra na detecção de conflitos */
  resource_id?: string | null;
  recurrence_freq: RecurrenceFreq | null;
  recurrence_interval: number;
  recurrence_weekdays: number[] | null;
  recurrence_until: LocalDate | null;
  recurrence_count: number | null;
  participant_ids?: string[];
  updated_at?: string;
};

export type AgendaException = {
  event_id: string;
  occurrence_start: string;
  kind: "cancelada" | "alterada";
  new_starts_at?: string | null;
  new_ends_at?: string | null;
  new_title?: string | null;
  new_location?: string | null;
};

export type Occurrence = {
  event: AgendaEvent;
  /** Início ORIGINAL (identifica a ocorrência, como RECURRENCE-ID) */
  key: string;
  start: Date;
  end: Date;
  title: string;
  location: string | null;
  modified: boolean;
};

const MAX_ITERATIONS = 2000;

/** Datas locais (AAAA-MM-DD) de cada ocorrência, sem aplicar exceções. */
export function occurrenceDates(ev: AgendaEvent, limitDate: LocalDate): LocalDate[] {
  const base = zonedParts(ev.starts_at).date;
  if (!ev.recurrence_freq) return [base];

  const interval = Math.max(1, ev.recurrence_interval || 1);
  const until = ev.recurrence_until && ev.recurrence_until < limitDate ? ev.recurrence_until : limitDate;
  const maxCount = ev.recurrence_count ?? Number.POSITIVE_INFINITY;
  const out: LocalDate[] = [];

  if (ev.recurrence_freq === "diaria") {
    for (let k = 0; k < MAX_ITERATIONS && out.length < maxCount; k++) {
      const d = addDays(base, k * interval);
      if (d > until) break;
      out.push(d);
    }
    return out;
  }

  if (ev.recurrence_freq === "semanal") {
    const days = (ev.recurrence_weekdays?.length ? ev.recurrence_weekdays : [weekday(base)])
      .map((w) => (w + 6) % 7) // segunda = 0 … domingo = 6
      .sort((a, b) => a - b);
    const week0 = startOfWeek(base);
    for (let k = 0; k < MAX_ITERATIONS && out.length < maxCount; k++) {
      const weekStart = addDays(week0, k * 7 * interval);
      if (weekStart > until) break;
      for (const offset of days) {
        const d = addDays(weekStart, offset);
        if (d < base) continue;
        if (d > until || out.length >= maxCount) break;
        out.push(d);
      }
    }
    return out;
  }

  // mensal: mesmo dia do mês; meses sem esse dia são pulados (comportamento RFC 5545)
  const day = Number(base.slice(8, 10));
  for (let k = 0; k < MAX_ITERATIONS && out.length < maxCount; k++) {
    const d = addMonths(base, k * interval);
    if (d > until) break;
    if (Number(d.slice(8, 10)) !== day) continue;
    out.push(d);
  }
  return out;
}

/** Ocorrências que intersectam [rangeStart, rangeEnd), com exceções aplicadas. */
export function expandOccurrences(
  ev: AgendaEvent,
  exceptions: AgendaException[],
  rangeStart: Date,
  rangeEnd: Date,
): Occurrence[] {
  const startParts = zonedParts(ev.starts_at);
  const durationMs = Date.parse(ev.ends_at) - Date.parse(ev.starts_at);
  const limit = zonedParts(new Date(rangeEnd.getTime() + 86400000)).date;
  const byKey = new Map(
    exceptions.filter((x) => x.event_id === ev.id).map((x) => [new Date(x.occurrence_start).getTime(), x]),
  );

  const out: Occurrence[] = [];
  for (const date of occurrenceDates(ev, limit)) {
    const originalStart = ev.recurrence_freq ? zonedToUtc(date, startParts.time) : new Date(ev.starts_at);
    const exc = byKey.get(originalStart.getTime());
    if (exc?.kind === "cancelada") continue;
    const start = exc?.kind === "alterada" && exc.new_starts_at ? new Date(exc.new_starts_at) : originalStart;
    const end =
      exc?.kind === "alterada" && exc.new_ends_at ? new Date(exc.new_ends_at) : new Date(originalStart.getTime() + durationMs);
    if (end <= rangeStart || start >= rangeEnd) continue;
    out.push({
      event: ev,
      key: originalStart.toISOString(),
      start,
      end,
      title: (exc?.kind === "alterada" && exc.new_title) || ev.title,
      location: (exc?.kind === "alterada" && exc.new_location) || ev.location || null,
      modified: exc?.kind === "alterada",
    });
  }
  return out;
}

export function expandAll(events: AgendaEvent[], exceptions: AgendaException[], rangeStart: Date, rangeEnd: Date) {
  return events
    .flatMap((e) => expandOccurrences(e, exceptions, rangeStart, rangeEnd))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

export type Conflict = { a: Occurrence; b: Occurrence; reasons: string[] };

/**
 * Conflito = duas ocorrências que se sobrepõem no tempo e compartilham
 * a mesma pessoa (responsável/participante), a mesma equipe ou o mesmo ambiente.
 */
export function detectConflicts(occurrences: Occurrence[], personName: (id: string) => string = (id) => id): Conflict[] {
  const sorted = [...occurrences].sort((x, y) => x.start.getTime() - y.start.getTime());
  const conflicts: Conflict[] = [];
  const resources = (o: Occurrence) => {
    const r = new Set<string>();
    if (o.event.owner_person_id) r.add(`p:${o.event.owner_person_id}`);
    for (const p of o.event.participant_ids ?? []) r.add(`p:${p}`);
    if (o.event.team_id) r.add(`t:${o.event.team_id}`);
    if (o.event.resource_id) r.add(`r:${o.event.resource_id}`);
    return r;
  };
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    const ra = resources(a);
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      if (b.start >= a.end) break;
      if (a.event.all_day || b.event.all_day) continue;
      const reasons: string[] = [];
      for (const res of resources(b)) {
        if (!ra.has(res)) continue;
        reasons.push(res.startsWith("t:") ? "mesma equipe" : res.startsWith("r:") ? "mesmo ambiente" : personName(res.slice(2)));
      }
      if (reasons.length) conflicts.push({ a, b, reasons });
    }
  }
  return conflicts;
}

/* ------------------------------------------------------------------ ICS --- */

const ICS_DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

export function escapeIcsText(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Dobra linhas em 75 octetos (RFC 5545 §3.1), sem quebrar caracteres multibyte. */
export function foldIcsLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  const limit = () => (parts.length === 0 ? 75 : 74);
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (size + n > limit()) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += n;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

function localStamp(instant: Date | string) {
  const p = zonedParts(instant);
  return `${p.date.replace(/-/g, "")}T${p.time.replace(":", "")}00`;
}
function utcStamp(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function buildRrule(ev: AgendaEvent): string | null {
  if (!ev.recurrence_freq) return null;
  const freq = { diaria: "DAILY", semanal: "WEEKLY", mensal: "MONTHLY" }[ev.recurrence_freq];
  const parts = [`FREQ=${freq}`, `INTERVAL=${Math.max(1, ev.recurrence_interval || 1)}`];
  if (ev.recurrence_freq === "semanal" && ev.recurrence_weekdays?.length) {
    parts.push(`BYDAY=${[...ev.recurrence_weekdays].sort().map((d) => ICS_DAYS[d]).join(",")}`);
  }
  if (ev.recurrence_count) parts.push(`COUNT=${ev.recurrence_count}`);
  if (ev.recurrence_until) {
    // UNTIL em UTC: último instante do dia local informado
    const endOfDay = new Date(zonedToUtc(addDays(ev.recurrence_until, 1)).getTime() - 1000);
    parts.push(`UNTIL=${utcStamp(endOfDay)}`);
  }
  return `RRULE:${parts.join(";")}`;
}

export function buildIcs(
  events: AgendaEvent[],
  exceptions: AgendaException[],
  opts: { calendarName: string; host: string; now?: Date },
): string {
  const now = utcStamp(opts.now ?? new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//COMPETE VIX//Agenda//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(opts.calendarName)}`,
    `X-WR-TIMEZONE:${TZ}`,
    // America/Sao_Paulo sem horário de verão desde 2019
    "BEGIN:VTIMEZONE",
    `TZID:${TZ}`,
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:-0300",
    "TZOFFSETTO:-0300",
    "TZNAME:-03",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];

  const timeProps = (start: Date | string, end: Date | string, allDay: boolean | undefined) =>
    allDay
      ? [
          `DTSTART;VALUE=DATE:${zonedParts(start).date.replace(/-/g, "")}`,
          `DTEND;VALUE=DATE:${addDays(zonedParts(new Date(new Date(end).getTime() - 1)).date, 1).replace(/-/g, "")}`,
        ]
      : [`DTSTART;TZID=${TZ}:${localStamp(start)}`, `DTEND;TZID=${TZ}:${localStamp(end)}`];

  for (const ev of events) {
    const uid = `${ev.id}@${opts.host}`;
    const evExc = exceptions.filter((x) => x.event_id === ev.id);
    lines.push("BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${now}`, ...timeProps(ev.starts_at, ev.ends_at, ev.all_day));
    lines.push(`SUMMARY:${escapeIcsText(ev.title)}`);
    if (ev.description) lines.push(`DESCRIPTION:${escapeIcsText(ev.description)}`);
    if (ev.location) lines.push(`LOCATION:${escapeIcsText(ev.location)}`);
    if (ev.type) lines.push(`CATEGORIES:${escapeIcsText(ev.type)}`);
    const rrule = buildRrule(ev);
    if (rrule) lines.push(rrule);
    for (const x of evExc.filter((e) => e.kind === "cancelada")) {
      lines.push(`EXDATE;TZID=${TZ}:${localStamp(x.occurrence_start)}`);
    }
    lines.push("END:VEVENT");

    for (const x of evExc.filter((e) => e.kind === "alterada" && e.new_starts_at && e.new_ends_at)) {
      lines.push(
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${now}`,
        `RECURRENCE-ID;TZID=${TZ}:${localStamp(x.occurrence_start)}`,
        ...timeProps(x.new_starts_at!, x.new_ends_at!, ev.all_day),
        `SUMMARY:${escapeIcsText(x.new_title || ev.title)}`,
      );
      const loc = x.new_location || ev.location;
      if (loc) lines.push(`LOCATION:${escapeIcsText(loc)}`);
      lines.push("END:VEVENT");
    }
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

export const EVENT_TYPE_LABEL: Record<string, string> = {
  treino: "Treino",
  reuniao: "Reunião",
  simulado: "Simulado",
  banca: "Banca",
  visita: "Visita",
  competicao: "Competição",
  prazo: "Prazo",
  outro: "Outro",
};

export const WEEKDAY_LABEL = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
