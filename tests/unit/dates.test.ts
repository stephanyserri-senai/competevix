import { describe, expect, it } from "vitest";
import { addMonths, formatDate, startOfWeek, todayLocal, weekday, zonedParts, zonedToUtc, isValidLocalDate } from "@/lib/dates";

describe("datas no fuso America/Sao_Paulo", () => {
  it("converte parede local → UTC (−03:00)", () => {
    expect(zonedToUtc("2026-12-01", "08:00").toISOString()).toBe("2026-12-01T11:00:00.000Z");
    expect(zonedToUtc("2026-12-01", "22:30").toISOString()).toBe("2026-12-02T01:30:00.000Z");
  });
  it("respeita horário de verão histórico (2018)", () => {
    // 2018-12-01 estava em −02:00
    expect(zonedToUtc("2018-12-01", "08:00").toISOString()).toBe("2018-12-01T10:00:00.000Z");
  });
  it("UTC → data local; 'hoje' perto da meia-noite UTC continua no dia anterior em SP", () => {
    expect(zonedParts("2026-12-02T01:30:00Z").date).toBe("2026-12-01");
    expect(todayLocal(new Date("2026-11-25T02:00:00Z"))).toBe("2026-11-24");
  });
  it("aritmética de calendário", () => {
    expect(weekday("2026-11-24")).toBe(2);
    expect(startOfWeek("2026-11-29")).toBe("2026-11-23");
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
    expect(formatDate("2026-11-24")).toBe("24/11/2026");
    expect(isValidLocalDate("2026-02-30")).toBe(false);
  });
});
