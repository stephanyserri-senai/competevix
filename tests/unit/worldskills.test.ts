import { describe, expect, it } from "vitest";
import {
  chByPerson, chTotal, deviation, executionRate, latestComparable, plannedMinutes, rampTargetFor, formatMinutes,
} from "@/features/worldskills/domain";

// Semana de 30/11/2026 (seg) a 06/12/2026 (dom)
const W = ["2026-11-30", "2026-12-06"] as const;
const at = (date: string, time = "08:00") => {
  const [h, m] = time.split(":").map(Number);
  return new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), h + 3, m)).toISOString();
};

describe("CH — critérios de aceite da Etapa 2", () => {
  it("jornada variável: 50% de 40h = 20h/semana; vigência parcial rateia por dia útil", () => {
    expect(plannedMinutes({ person_id: "o", team_id: "t", planned_weekly_minutes: 1200, valid_from: "2026-11-01", valid_to: null }, ...W)).toBe(1200);
    // começa na quarta: 3 dias úteis de 5
    expect(plannedMinutes({ person_id: "o", team_id: "t", planned_weekly_minutes: 1200, valid_from: "2026-12-02", valid_to: null }, ...W)).toBe(720);
    // mudança de jornada no meio da semana: 8h/dia até terça, 4h/dia depois
    const rows = chByPerson(
      [
        { person_id: "c", team_id: "t", planned_weekly_minutes: 2400, valid_from: "2026-11-01", valid_to: "2026-12-01" },
        { person_id: "c", team_id: "t", planned_weekly_minutes: 1200, valid_from: "2026-12-02", valid_to: null },
      ],
      [],
      ...W,
    );
    expect(rows[0].planned).toBe(2 * 480 + 3 * 240);
  });

  it("ausência reduz o efetivo; denominador zero = N/A", () => {
    const allocs = [{ person_id: "c", team_id: "t", planned_weekly_minutes: 2400, valid_from: "2026-11-01", valid_to: null }];
    const att = [
      { person_id: "c", team_id: "t", attended_minutes: 480, session_starts_at: at("2026-11-30") },
      { person_id: "c", team_id: "t", attended_minutes: 0, session_starts_at: at("2026-12-01") }, // ausente
      { person_id: "c", team_id: "t", attended_minutes: 480, session_starts_at: at("2026-12-02") },
      { person_id: "c", team_id: "t", attended_minutes: 480, session_starts_at: at("2026-12-03") },
      { person_id: "c", team_id: "t", attended_minutes: 480, session_starts_at: at("2026-12-04") },
      { person_id: "c", team_id: "t", attended_minutes: 480, session_starts_at: at("2026-12-07") }, // fora do período
    ];
    const [r] = chByPerson(allocs, att, ...W);
    expect(r).toMatchObject({ planned: 2400, effective: 1920 });
    expect(r.pct).toBe(80);
    expect(chByPerson([], [], ...W)).toEqual([]);
    const sem = chByPerson([], [{ person_id: "x", team_id: "t", attended_minutes: 60, session_starts_at: at("2026-12-01") }], ...W);
    expect(sem[0].pct).toBeNull();
  });

  it("equipe dupla: por equipe separa; por pessoa soma sem duplicar; orientador não multiplica por alunos", () => {
    const allocs = [
      { person_id: "o", team_id: "A", planned_weekly_minutes: 1200, valid_from: "2026-11-01", valid_to: null },
      { person_id: "o", team_id: "B", planned_weekly_minutes: 600, valid_from: "2026-11-01", valid_to: null },
      { person_id: "c1", team_id: "A", planned_weekly_minutes: 2400, valid_from: "2026-11-01", valid_to: null },
      { person_id: "c2", team_id: "A", planned_weekly_minutes: 2400, valid_from: "2026-11-01", valid_to: null },
    ];
    const att = [
      // uma sessão da equipe A com 3 pessoas: orientador conta 240 uma vez só
      { person_id: "o", team_id: "A", attended_minutes: 240, session_starts_at: at("2026-12-01") },
      { person_id: "c1", team_id: "A", attended_minutes: 240, session_starts_at: at("2026-12-01") },
      { person_id: "c2", team_id: "A", attended_minutes: 240, session_starts_at: at("2026-12-01") },
      { person_id: "o", team_id: "B", attended_minutes: 120, session_starts_at: at("2026-12-02") },
    ];
    const teamA = chByPerson(allocs, att, ...W, { teamId: "A" });
    expect(teamA.find((r) => r.person_id === "o")).toMatchObject({ planned: 1200, effective: 240 });
    const person = chByPerson(allocs, att, ...W).find((r) => r.person_id === "o")!;
    expect(person).toMatchObject({ planned: 1800, effective: 360 });
    expect(chTotal(teamA)).toMatchObject({ planned: 6000, effective: 720 });
  });
});

describe("execução do plano e desvio de pontuação", () => {
  it("execução ignora cancelados e itens fora do período", () => {
    const items = [
      { due_date: "2026-12-01", status: "concluido" as const },
      { due_date: "2026-12-02", status: "previsto" as const },
      { due_date: "2026-12-03", status: "cancelado" as const },
      { due_date: "2026-12-20", status: "concluido" as const },
    ];
    expect(executionRate(items, ...W)).toEqual({ done: 1, total: 2, pct: 50 });
    expect(executionRate([], ...W).pct).toBeNull();
  });

  it("compara apenas escalas equivalentes", () => {
    const scores = [
      { id: "a", held_on: "2026-12-18", type: "completo", scale: "percentual" as const, score: 85, occupation_id: "o" },
      { id: "b", held_on: "2026-12-10", type: "completo", scale: "worldskills" as const, score: 731, occupation_id: "o" },
      { id: "c", held_on: "2026-11-10", type: "parcial", scale: "worldskills" as const, score: 700, occupation_id: "o" },
    ];
    const last = latestComparable(scores, "o", "worldskills");
    expect(last?.id).toBe("b");
    expect(deviation(last?.score, 750)).toBe(-19);
    expect(latestComparable(scores, "outra", "worldskills")).toBeNull();
    expect(deviation(null, 750)).toBeNull();
    const ramp = [
      { occupation_id: "o", month: "2026-12-01", target: 720, scale: "worldskills" as const, status: "proposta" as const },
      { occupation_id: "o", month: "2026-12-01", target: 80, scale: "percentual" as const, status: "aprovada" as const },
    ];
    expect(rampTargetFor(ramp, "o", "2026-12-10", "worldskills")?.target).toBe(720);
    expect(rampTargetFor(ramp, "o", "2027-01-10", "worldskills")).toBeNull();
    expect(formatMinutes(1290)).toBe("21h30");
  });
});
