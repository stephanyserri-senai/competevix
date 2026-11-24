/**
 * Datas: o banco guarda instantes em UTC; a interface apresenta e interpreta em
 * America/Sao_Paulo (PRD §3). Sem dependências externas: usa Intl.
 * "LocalDate" = "AAAA-MM-DD"; "LocalTime" = "HH:MM".
 */
export const TZ = "America/Sao_Paulo";
export const LOCALE = "pt-BR";

export type LocalDate = string;

const partsFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Partes de data/hora de parede no fuso institucional. */
export function zonedParts(instant: Date | string) {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  const p = Object.fromEntries(partsFmt.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}` as LocalDate,
    time: `${p.hour}:${p.minute}`,
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
  };
}

/** Deslocamento (minutos) do fuso em relação a UTC num instante. */
function offsetMinutes(instant: Date): number {
  const p = zonedParts(instant);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000);
}

/** Converte data+hora de parede em São Paulo para instante UTC (lida com mudanças de offset). */
export function zonedToUtc(date: LocalDate, time = "00:00"): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let result = new Date(guess - offsetMinutes(new Date(guess)) * 60000);
  // segunda iteração cobre transições de horário de verão
  result = new Date(guess - offsetMinutes(result) * 60000);
  return result;
}

/** "Hoje" no fuso institucional. */
export function todayLocal(now = new Date()): LocalDate {
  return zonedParts(now).date;
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

export function addMonths(date: LocalDate, months: number): LocalDate {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/** 0 = domingo … 6 = sábado */
export function weekday(date: LocalDate): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Segunda-feira da semana da data (semana ISO). */
export function startOfWeek(date: LocalDate): LocalDate {
  const wd = weekday(date);
  return addDays(date, wd === 0 ? -6 : 1 - wd);
}

export function startOfMonth(date: LocalDate): LocalDate {
  return `${date.slice(0, 7)}-01`;
}

export function daysBetween(a: LocalDate, b: LocalDate): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

export function isValidLocalDate(s: string): s is LocalDate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const dateFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const timeFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const monthFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: "UTC", month: "long", year: "numeric" });
const weekdayFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: "UTC", weekday: "short" });

/** Data de negócio (sem fuso) → "dd/mm/aaaa" */
export function formatDate(date: LocalDate | null | undefined): string {
  if (!date) return "—";
  return dateFmt.format(new Date(`${date}T00:00:00Z`));
}
/** Instante UTC → "dd/mm/aaaa hh:mm" em São Paulo */
export function formatDateTime(instant: string | Date | null | undefined): string {
  if (!instant) return "—";
  return dateTimeFmt.format(typeof instant === "string" ? new Date(instant) : instant);
}
export function formatTime(instant: string | Date): string {
  return timeFmt.format(typeof instant === "string" ? new Date(instant) : instant);
}
export function formatMonth(date: LocalDate): string {
  const s = monthFmt.format(new Date(`${date}T00:00:00Z`));
  return s.charAt(0).toUpperCase() + s.slice(1);
}
export function formatWeekday(date: LocalDate): string {
  return weekdayFmt.format(new Date(`${date}T00:00:00Z`)).replace(".", "");
}
