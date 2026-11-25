/**
 * Etapa 4.1: calendário de dias não úteis, paridade da CH (SQL × domínio TS)
 * e alertas por cadência, desligados até a configuração do programa.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { as, connect, expectError, hasDb, sql } from "./helpers";
import { buildScenario, type Scenario } from "./fixtures";
import { chByPerson, chTotal } from "@/features/worldskills/domain";

describe.skipIf(!hasDb)("Calendário, CH e cadências", () => {
  let c: Client;
  let s: Scenario;
  beforeAll(async () => {
    c = await connect();
    s = await buildScenario(c);
  });
  afterAll(async () => c?.end());

  it("calendário: supervisão marca dias da própria unidade; global só administração", async () => {
    await sql(c, "delete from calendar_days where unit_id is null and day = '2026-12-25'");
    await as(c, s.users.supA, () => sql(c, "insert into calendar_days (unit_id, day, kind, description) values ($1, '2026-12-02', 'feriado_municipal', 'Feriado municipal (teste)')", [s.units.A]));
    const glob = await expectError(as(c, s.users.supA, () => sql(c, "insert into calendar_days (day, kind, description) values ('2026-12-25', 'feriado_nacional', 'Natal')")));
    expect(glob).toMatch(/row-level/);
    const other = await expectError(as(c, s.users.supB, () => sql(c, "insert into calendar_days (unit_id, day, kind, description) values ($1, '2026-12-03', 'recesso', 'x x')", [s.units.A])));
    expect(other).toMatch(/row-level/);
    await as(c, s.users.admin, () => sql(c, "insert into calendar_days (day, kind, description) values ('2026-12-25', 'feriado_nacional', 'Natal')"));
    expect((await as(c, s.users.comp1, () => sql(c, "select id from calendar_days where day in ('2026-12-02','2026-12-25') and (unit_id is null or unit_id = $1)", [s.units.A]))).length).toBe(2);
  });

  it("CH no banco = CH no domínio (feriado, vigência parcial, duas alocações, ausência)", async () => {
    const pe = async (name: string) => (await sql<{ id: string }>(c, "insert into people (unit_id, full_name, kind) values ($1, $2, 'aluno') returning id", [s.units.A, name]))[0].id;
    const x = await pe("Pessoa X");
    const y = await pe("Pessoa Y");
    // semana 30/11–06/12/2026 com feriado municipal em 02/12 (unidade A)
    await sql(c, "insert into allocations (program_id, team_id, person_id, base_weekly_minutes, percent, valid_from, valid_to) values ($1, $2, $3, 2400, 100, '2026-11-01', '2026-12-01'), ($1, $2, $3, 2400, 50, '2026-12-02', null), ($1, $2, $4, 2400, 33, '2026-12-03', null)", [s.programs.P1, s.teams.T1, x, y]);
    const [{ id: sess }] = await sql<{ id: string }>(c, "insert into training_sessions (program_id, team_id, starts_at, ends_at, actual_minutes) values ($1, $2, '2026-12-01T11:00Z', '2026-12-01T15:00Z', 230) returning id", [s.programs.P1, s.teams.T1]);
    await sql(c, "insert into attendance (session_id, program_id, person_id, status, attended_minutes) values ($1, $2, $3, 'presente', 230), ($1, $2, $4, 'ausente', 0)", [sess, s.programs.P1, x, y]);

    const [db] = await sql<{ planned: number; effective: number }>(c, "select * from private.team_ch($1, '2026-11-30', '2026-12-06')", [s.teams.T1]);
    const allocs = await sql<{ person_id: string; team_id: string; planned_weekly_minutes: number; valid_from: string; valid_to: string | null }>(c,
      "select person_id, team_id, planned_weekly_minutes, to_char(valid_from, 'YYYY-MM-DD') valid_from, to_char(valid_to, 'YYYY-MM-DD') valid_to from allocations where team_id = $1", [s.teams.T1]);
    const att = await sql<{ person_id: string; attended_minutes: number; session_starts_at: string; team_id: string }>(c,
      "select a.person_id, a.attended_minutes, s.starts_at::text as session_starts_at, s.team_id from attendance a join training_sessions s on s.id = a.session_id where s.team_id = $1", [s.teams.T1]);
    const holidays = new Set((await sql<{ day: string }>(c, "select to_char(day, 'YYYY-MM-DD') as day from calendar_days where affects_ch and (unit_id is null or unit_id = $1)", [s.units.A])).map((d) => d.day));
    const ts = chTotal(chByPerson(allocs.map((a) => ({ ...a, planned_weekly_minutes: Number(a.planned_weekly_minutes) })), att.map((a) => ({ ...a, session_starts_at: new Date(a.session_starts_at).toISOString() })), "2026-11-30", "2026-12-06", { teamId: s.teams.T1, nonWorking: holidays }));
    expect(db).toEqual({ planned: ts.planned, effective: ts.effective });
    // X: 2 dias × 480 (seg/ter) + 2 dias × 240 (qui/sex; quarta é feriado); Y: 2 dias × round(792/5)
    expect(ts.planned).toBe(2 * 480 + 2 * 240 + Math.round((792 / 5) * 2));
  });

  it("alertas de cadência ficam desligados até configurar; ligam e resolvem conforme os registros", async () => {
    await sql(c, "insert into training_plans (program_id, team_id, title, period_start, period_end, status) values ($1, $2, 'Plano', current_date - 60, current_date + 60, 'publicado')", [s.programs.P1, s.teams.T2]);
    await sql(c, "insert into allocations (program_id, team_id, person_id, base_weekly_minutes, percent, valid_from) values ($1, $2, $3, 2400, 100, current_date - 40)", [s.programs.P1, s.teams.T2, s.people.pComp2]);
    const count = async (rule: string) => (await sql(c, "select id from notifications where rule = $1 and entity_id = $2 and resolved_at is null", [rule, s.teams.T2])).length;

    await sql(c, "select * from refresh_alerts_cadence()");
    expect(await count("ch_abaixo_meta")).toBe(0);
    expect(await count("simulado_ausente")).toBe(0);

    await sql(c, `update programs set settings = settings || '{"alerta_ch": "true", "simulado_parcial": "semanal"}' where id = $1`, [s.programs.P1]);
    await sql(c, "select * from refresh_alerts_cadence()");
    expect(await count("ch_abaixo_meta")).toBeGreaterThan(0);
    expect(await count("simulado_ausente")).toBeGreaterThan(0);

    const [{ id: a }] = await sql<{ id: string }>(c, "insert into assessments (program_id, team_id, type, title, held_on, scale, scale_max) values ($1, $2, 'parcial', 'Parcial', (date_trunc('week', (now() at time zone 'America/Sao_Paulo')::date) - interval '3 days')::date, 'pontos_brutos', 100) returning id", [s.programs.P1, s.teams.T2]);
    await sql(c, "insert into assessment_results (assessment_id, program_id, score) values ($1, $2, 70)", [a, s.programs.P1]);
    await sql(c, "update assessments set status = 'publicado' where id = $1", [a]);
    await sql(c, "select * from refresh_alerts_cadence()");
    expect(await count("simulado_ausente")).toBe(0);
    await sql(c, `update programs set settings = settings - 'alerta_ch' - 'simulado_parcial' where id = $1`, [s.programs.P1]);
  });
});
