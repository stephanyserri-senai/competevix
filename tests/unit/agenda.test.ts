import { describe, expect, it } from "vitest";
import { buildIcs, detectConflicts, expandOccurrences, foldIcsLine, occurrenceDates, type AgendaEvent } from "@/features/agenda/domain";

const base: AgendaEvent = {
  id: "11111111-1111-1111-1111-111111111111",
  title: "Treino",
  starts_at: "2026-11-30T11:00:00Z", // seg 08:00 BRT
  ends_at: "2026-11-30T15:00:00Z",
  recurrence_freq: null,
  recurrence_interval: 1,
  recurrence_weekdays: null,
  recurrence_until: null,
  recurrence_count: null,
};
const range = (a: string, b: string) => [new Date(a), new Date(b)] as const;

describe("recorrência", () => {
  it("semanal seg/qua/sex com COUNT", () => {
    const ev = { ...base, recurrence_freq: "semanal" as const, recurrence_weekdays: [1, 3, 5], recurrence_count: 5 };
    expect(occurrenceDates(ev, "2027-12-31")).toEqual(["2026-11-30", "2026-12-02", "2026-12-04", "2026-12-07", "2026-12-09"]);
  });
  it("quinzenal com UNTIL inclusivo", () => {
    const ev = { ...base, recurrence_freq: "semanal" as const, recurrence_interval: 2, recurrence_until: "2026-12-28" };
    expect(occurrenceDates(ev, "2027-12-31")).toEqual(["2026-11-30", "2026-12-14", "2026-12-28"]);
  });
  it("mensal pula meses sem o dia (31)", () => {
    const ev = { ...base, starts_at: "2027-01-31T11:00:00Z", ends_at: "2027-01-31T12:00:00Z", recurrence_freq: "mensal" as const, recurrence_count: 3 };
    expect(occurrenceDates(ev, "2027-12-31")).toEqual(["2027-01-31", "2027-03-31", "2027-05-31"]);
  });
  it("hora local preservada e exceções aplicadas", () => {
    const ev = { ...base, recurrence_freq: "diaria" as const, recurrence_count: 3 };
    const occ = expandOccurrences(
      ev,
      [
        { event_id: ev.id, occurrence_start: "2026-12-01T11:00:00Z", kind: "cancelada" },
        { event_id: ev.id, occurrence_start: "2026-12-02T11:00:00Z", kind: "alterada", new_starts_at: "2026-12-02T17:00:00Z", new_ends_at: "2026-12-02T19:00:00Z", new_title: "Treino remarcado" },
      ],
      ...range("2026-11-01T00:00:00Z", "2027-01-01T00:00:00Z"),
    );
    expect(occ.map((o) => o.start.toISOString())).toEqual(["2026-11-30T11:00:00.000Z", "2026-12-02T17:00:00.000Z"]);
    expect(occ[1]).toMatchObject({ title: "Treino remarcado", modified: true, key: "2026-12-02T11:00:00.000Z" });
  });
  it("filtra pelo intervalo pedido", () => {
    const ev = { ...base, recurrence_freq: "diaria" as const, recurrence_count: 30 };
    expect(expandOccurrences(ev, [], ...range("2026-12-10T00:00:00Z", "2026-12-12T00:00:00Z"))).toHaveLength(2);
  });
});

describe("conflitos", () => {
  it("acusa sobreposição com mesma pessoa ou equipe e ignora pessoas distintas", () => {
    const a = { ...base, id: "a", owner_person_id: "p1" };
    const b = { ...base, id: "b", starts_at: "2026-11-30T13:00:00Z", ends_at: "2026-11-30T14:00:00Z", participant_ids: ["p1"] };
    const c = { ...base, id: "c", owner_person_id: "p9" };
    const d = { ...base, id: "d", starts_at: "2026-11-30T15:00:00Z", ends_at: "2026-11-30T16:00:00Z", owner_person_id: "p1" };
    const r = range("2026-11-30T00:00:00Z", "2026-12-01T00:00:00Z");
    const occ = [a, b, c, d].flatMap((e) => expandOccurrences(e, [], ...r));
    const conflicts = detectConflicts(occ, (id) => `Pessoa ${id}`);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].reasons).toEqual(["Pessoa p1"]);
  });
});

describe("ICS", () => {
  it("gera RRULE, EXDATE e RECURRENCE-ID no fuso local", () => {
    const ev = { ...base, title: "Treino, técnico; semanal", recurrence_freq: "semanal" as const, recurrence_weekdays: [1, 3], recurrence_until: "2026-12-31" };
    const ics = buildIcs(
      [ev],
      [
        { event_id: ev.id, occurrence_start: "2026-12-02T11:00:00Z", kind: "cancelada" },
        { event_id: ev.id, occurrence_start: "2026-12-07T11:00:00Z", kind: "alterada", new_starts_at: "2026-12-07T13:00:00Z", new_ends_at: "2026-12-07T17:00:00Z" },
      ],
      { calendarName: "Teste", host: "compete.local", now: new Date("2026-11-24T12:00:00Z") },
    );
    expect(ics).toContain("DTSTART;TZID=America/Sao_Paulo:20261130T080000");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE;UNTIL=20270101T025959Z");
    expect(ics).toContain("EXDATE;TZID=America/Sao_Paulo:20261202T080000");
    expect(ics).toContain("RECURRENCE-ID;TZID=America/Sao_Paulo:20261207T080000");
    expect(ics).toContain("SUMMARY:Treino\\, técnico\\; semanal");
    expect(ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });
  it("dobra linhas longas sem quebrar acentos", () => {
    const folded = foldIcsLine("DESCRIPTION:" + "ação ".repeat(40));
    expect(folded.split("\r\n ").join("")).toBe("DESCRIPTION:" + "ação ".repeat(40));
  });
});
