import { addDays, addMonths, isValidLocalDate, startOfMonth, startOfWeek, todayLocal, type LocalDate } from "@/lib/dates";

export type Periodicity = "semanal" | "mensal";

/** Período fechado que contém a data de corte (semana seg–dom ou mês civil), limitado à data de corte. */
export function reportPeriod(periodicity: Periodicity, cutoffRaw: string | undefined) {
  const cutoff: LocalDate = cutoffRaw && isValidLocalDate(cutoffRaw) ? cutoffRaw : todayLocal();
  const start = periodicity === "semanal" ? startOfWeek(cutoff) : startOfMonth(cutoff);
  const fullEnd = periodicity === "semanal" ? addDays(start, 6) : addDays(addMonths(start, 1), -1);
  const end = fullEnd < cutoff ? fullEnd : cutoff;
  return { cutoff, start, end };
}
