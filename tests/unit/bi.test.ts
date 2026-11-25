import { describe, expect, it } from "vitest";
import { byGroup, kpis, needsNote, nextStages, weekly, type BiAction } from "@/features/bi/domain";

const a = (p: Partial<BiAction>): BiAction => ({
  id: Math.random().toString(36), stage: "a_fazer", due_date: null, created_at: "2026-11-20T12:00:00Z", completed_at: null,
  is_overdue: false, completed_on_time: null, blocked: false, competition_id: "ws", owner_person_id: "p1", theme: "treino", ...p,
});

describe("BI de ações", () => {
  const rows = [
    a({ stage: "concluida", completed_at: "2026-11-24T15:00:00Z", completed_on_time: true }),
    a({ stage: "concluida", completed_at: "2026-11-25T15:00:00Z", completed_on_time: false }),
    a({ stage: "concluida", completed_at: "2026-11-25T15:00:00Z", completed_on_time: null }), // sem prazo
    a({ stage: "em_validacao", competition_id: "inova" }),
    a({ stage: "em_andamento", is_overdue: true, blocked: true, owner_person_id: null, theme: null }),
    a({ stage: "cancelada" }),
  ];
  it("KPIs: % no prazo só sobre concluídas com prazo; sem base = null", () => {
    const k = kpis(rows, "2026-11-23", "2026-11-29");
    expect(k).toMatchObject({ active: 2, completedInPeriod: 3, onTimeBase: 2, overdue: 1, inValidation: 1, blocked: 1, withoutOwner: 1 });
    expect(k.onTimePct).toBe(50);
    expect(kpis([], "2026-11-23", "2026-11-29").onTimePct).toBeNull();
  });
  it("agrupa por frente e tema (canceladas fora; sem tema identificado)", () => {
    const f = byGroup(rows, (x) => x.competition_id, (k) => k.toUpperCase());
    expect(f[0]).toMatchObject({ key: "ws", concluida: 3, em_andamento: 1, overdue: 1, total: 4 });
    const t = byGroup(rows, (x) => x.theme, (k) => k, "Sem tema");
    expect(t.find((g) => g.key === "__none")?.label).toBe("Sem tema");
  });
  it("série semanal criadas × concluídas", () => {
    const w = weekly(rows, 2, "2026-11-25");
    expect(w.map((x) => x.week)).toEqual(["2026-11-16", "2026-11-23"]);
    expect(w[0].criadas).toBe(6);
    expect(w[1].concluidas).toBe(3);
  });
  it("movimentos do quadro espelham o banco", () => {
    expect(nextStages("em_andamento", false)).toEqual(["a_fazer", "em_validacao"]);
    expect(nextStages("em_validacao", false)).toEqual([]);
    expect(nextStages("em_validacao", true)).toEqual(["concluida", "em_andamento"]);
    expect(needsNote("em_validacao", "em_andamento")).toBe(true);
    expect(needsNote("em_andamento", "em_validacao")).toBe(false);
  });
});
