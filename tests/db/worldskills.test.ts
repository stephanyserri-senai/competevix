/**
 * Etapa 2 (PRD §12, item 2): WorldSkills e acompanhamento semanal.
 * Permissões por papel e regras de integridade aplicadas no banco.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { as, connect, expectError, hasDb, sql } from "./helpers";
import { buildScenario, type Scenario } from "./fixtures";

describe.skipIf(!hasDb)("Etapa 2 — WorldSkills e acompanhamento", () => {
  let c: Client;
  let s: Scenario;
  let O1: string, O2: string, C1: string, C2: string;
  const one = async <T,>(p: Promise<T[]>) => (await p)[0];

  beforeAll(async () => {
    c = await connect();
    s = await buildScenario(c);
    O1 = (await one(sql<{ id: string }>(c, "insert into occupations (program_id, code, name) values ($1, '#48', 'Indústria 4.0') returning id", [s.programs.P1]))).id;
    O2 = (await one(sql<{ id: string }>(c, "insert into occupations (program_id, code, name) values ($1, '#33', 'Automotiva') returning id", [s.programs.P1]))).id;
    await sql(c, "update teams set occupation_id = $1 where id = $2", [O1, s.teams.T1]);
    C1 = (await one(sql<{ id: string }>(c, "insert into competencies (program_id, occupation_id, name) values ($1, $2, 'CLP') returning id", [s.programs.P1, O1]))).id;
    C2 = (await one(sql<{ id: string }>(c, "insert into competencies (program_id, occupation_id, name) values ($1, $2, 'Freios') returning id", [s.programs.P1, O2]))).id;
  });
  afterAll(async () => c?.end());

  const plan = (user: string, team: string) =>
    as(c, user, async () =>
      (await one(sql<{ id: string }>(c, "insert into training_plans (program_id, team_id, title, period_start, period_end) values ($1, $2, 'Plano dez', '2026-12-01', '2026-12-31') returning id", [s.programs.P1, team]))).id,
    );
  const item = (user: string, planId: string, competency: string | null = C1, due = "2026-12-10") =>
    as(c, user, async () =>
      (await one(sql<{ id: string }>(c, "insert into training_items (plan_id, program_id, competency_id, objective, activity, planned_minutes, due_date) values ($1, $2, $3, 'Programar CLP', 'Exercício de ladder', 240, $4) returning id", [planId, s.programs.P1, competency, due]))).id,
    );

  describe("plano de treinamento", () => {
    it("orientador cria plano só da própria equipe; competidor lê só o da sua equipe", async () => {
      const p = await plan(s.users.orient1, s.teams.T1);
      const e = await expectError(plan(s.users.orient1, s.teams.T2));
      expect(e).toMatch(/row-level/);
      expect(await as(c, s.users.comp1, () => sql(c, "select id from training_plans where id = $1", [p]))).toHaveLength(1);
      expect(await as(c, s.users.comp2, () => sql(c, "select id from training_plans where id = $1", [p]))).toHaveLength(0);
      const e2 = await expectError(item(s.users.comp1, p));
      expect(e2).toMatch(/row-level/);
    });

    it("competência precisa ser da ocupação da equipe", async () => {
      const p = await plan(s.users.orient1, s.teams.T1);
      const e = await expectError(item(s.users.orient1, p, C2));
      expect(e).toMatch(/ocupação da equipe/);
    });

    it("execução só após publicar; conteúdo publicado é imutável; cancelamento exige justificativa", async () => {
      const p = await plan(s.users.orient1, s.teams.T1);
      const i = await item(s.users.orient1, p);
      const e0 = await expectError(as(c, s.users.orient1, () => sql(c, "update training_items set status = 'concluido' where id = $1", [i])));
      expect(e0).toMatch(/após publicar/);
      await as(c, s.users.orient1, () => sql(c, "select * from publish_training_plan($1)", [p]));
      const e1 = await expectError(as(c, s.users.orient1, () => sql(c, "update training_items set planned_minutes = 10 where id = $1", [i])));
      expect(e1).toMatch(/nova versão/);
      const e2 = await expectError(as(c, s.users.orient1, () => sql(c, "update training_items set status = 'cancelado' where id = $1", [i])));
      expect(e2).toMatch(/justificativa/);
      const [row] = await as(c, s.users.orient1, () => sql<{ completed_at: string }>(c, "update training_items set status = 'concluido' where id = $1 returning completed_at", [i]));
      expect(row.completed_at).toBeTruthy();
      const e3 = await expectError(as(c, s.users.orient1, () => sql(c, "delete from training_items where id = $1", [i])));
      expect(e3).toMatch(/não podem ser excluídos/);
    });

    it("nova versão exige motivo, copia itens não cancelados e substitui a anterior ao publicar", async () => {
      const p = await plan(s.users.orient1, s.teams.T1);
      await item(s.users.orient1, p);
      const cancel = await item(s.users.orient1, p);
      await as(c, s.users.orient1, () => sql(c, "select * from publish_training_plan($1)", [p]));
      await as(c, s.users.orient1, () => sql(c, "update training_items set status = 'cancelado', status_note = 'fora de escopo' where id = $1", [cancel]));
      const e = await expectError(as(c, s.users.orient1, () => sql(c, "select * from new_training_plan_version($1, ' ')", [p])));
      expect(e).toMatch(/motivo/);
      const [v2] = await as(c, s.users.orient1, () => sql<{ id: string; version: number }>(c, "select * from new_training_plan_version($1, 'ajuste após simulado')", [p]));
      expect(v2.version).toBe(2);
      const [{ n }] = await sql<{ n: number }>(c, "select count(*)::int n from training_items where plan_id = $1", [v2.id]);
      expect(n).toBe(1);
      await as(c, s.users.orient1, () => sql(c, "select * from publish_training_plan($1)", [v2.id]));
      const [{ status }] = await sql<{ status: string }>(c, "select status from training_plans where id = $1", [p]);
      expect(status).toBe("substituido");
    });
  });

  describe("sessões e presença", () => {
    let session: string;
    it("duração efetiva não excede o intervalo; presença não excede a duração efetiva", async () => {
      const e = await expectError(
        as(c, s.users.orient1, () => sql(c, "insert into training_sessions (program_id, team_id, starts_at, ends_at, actual_minutes) values ($1, $2, '2026-12-01T11:00Z', '2026-12-01T13:00Z', 150)", [s.programs.P1, s.teams.T1])),
      );
      expect(e).toMatch(/training_sessions_actual_ck/);
      session = await as(c, s.users.orient1, async () =>
        (await one(sql<{ id: string }>(c, "insert into training_sessions (program_id, team_id, competency_id, starts_at, ends_at, actual_minutes) values ($1, $2, $3, '2026-12-01T11:00Z', '2026-12-01T15:00Z', 220) returning id", [s.programs.P1, s.teams.T1, C1]))).id,
      );
      const e2 = await expectError(
        as(c, s.users.orient1, () => sql(c, "insert into attendance (session_id, program_id, person_id, status, attended_minutes) values ($1, $2, $3, 'presente', 230)", [session, s.programs.P1, s.people.pComp1])),
      );
      expect(e2).toMatch(/maior que a duração efetiva/);
    });

    it("status coerente com minutos; justificativa obrigatória; uma presença por pessoa e sessão", async () => {
      const e = await expectError(
        as(c, s.users.orient1, () => sql(c, "insert into attendance (session_id, program_id, person_id, status, attended_minutes) values ($1, $2, $3, 'ausente', 30)", [session, s.programs.P1, s.people.pComp1])),
      );
      expect(e).toMatch(/attendance_status_ck/);
      const e2 = await expectError(
        as(c, s.users.orient1, () => sql(c, "insert into attendance (session_id, program_id, person_id, status, attended_minutes) values ($1, $2, $3, 'justificada', 0)", [session, s.programs.P1, s.people.pComp1])),
      );
      expect(e2).toMatch(/attendance_justification_ck/);
      await as(c, s.users.orient1, () => sql(c, "insert into attendance (session_id, program_id, person_id, status, attended_minutes) values ($1, $2, $3, 'presente', 220), ($1, $2, $4, 'presente', 220)", [session, s.programs.P1, s.people.pComp1, s.people.pOrient1]));
      const dup = await expectError(
        as(c, s.users.orient1, () => sql(c, "insert into attendance (session_id, program_id, person_id, status, attended_minutes) values ($1, $2, $3, 'parcial', 100)", [session, s.programs.P1, s.people.pComp1])),
      );
      expect(dup).toMatch(/duplicate|attendance_pkey/);
      const e3 = await expectError(as(c, s.users.orient1, () => sql(c, "update training_sessions set actual_minutes = 200 where id = $1", [session])));
      expect(e3).toMatch(/presenças maiores/);
    });

    it("competidor de outra equipe não vê a sessão nem a presença", async () => {
      expect(await as(c, s.users.comp2, () => sql(c, "select session_id from attendance where session_id = $1", [session]))).toHaveLength(0);
      expect(await as(c, s.users.comp1, () => sql(c, "select session_id from attendance where session_id = $1", [session]))).toHaveLength(2);
    });
  });

  describe("alocações", () => {
    it("só supervisão aloca; minutos planejados = jornada × percentual; sem sobreposição", async () => {
      const e = await expectError(
        as(c, s.users.orient1, () => sql(c, "insert into allocations (program_id, team_id, person_id, base_weekly_minutes, percent, valid_from) values ($1, $2, $3, 2400, 50, '2026-12-01')", [s.programs.P1, s.teams.T1, s.people.pOrient1])),
      );
      expect(e).toMatch(/row-level/);
      const [a] = await as(c, s.users.supA, () =>
        sql<{ planned_weekly_minutes: number }>(c, "insert into allocations (program_id, team_id, person_id, base_weekly_minutes, percent, valid_from) values ($1, $2, $3, 2400, 50, '2026-12-01') returning planned_weekly_minutes", [s.programs.P1, s.teams.T1, s.people.pOrient1]),
      );
      expect(a.planned_weekly_minutes).toBe(1200);
      const ov = await expectError(
        as(c, s.users.supA, () => sql(c, "insert into allocations (program_id, team_id, person_id, base_weekly_minutes, percent, valid_from) values ($1, $2, $3, 2400, 25, '2026-12-15')", [s.programs.P1, s.teams.T1, s.people.pOrient1])),
      );
      expect(ov).toMatch(/allocations_no_overlap/);
      // equipe dupla: mesma pessoa alocada em outra equipe no mesmo período é permitido
      await as(c, s.users.supA, () =>
        sql(c, "insert into allocations (program_id, team_id, person_id, base_weekly_minutes, percent, valid_from) values ($1, $2, $3, 2400, 25, '2026-12-01')", [s.programs.P1, s.teams.T2, s.people.pOrient1]),
      );
    });

    it("pessoa vê a própria alocação; orientador vê a da equipe; competidor não vê a de terceiros", async () => {
      expect((await as(c, s.users.orient1, () => sql(c, "select id from allocations where person_id = $1", [s.people.pOrient1]))).length).toBe(2);
      expect(await as(c, s.users.comp1, () => sql(c, "select id from allocations where person_id = $1", [s.people.pOrient1]))).toHaveLength(0);
      expect((await as(c, s.users.gestaoA, () => sql(c, "select id from allocations"))).length).toBeGreaterThanOrEqual(2);
      expect(await as(c, s.users.supB, () => sql(c, "select id from allocations"))).toHaveLength(0);
    });
  });

  describe("simulados", () => {
    it("nota acima da escala é rejeitada; publicação exige nota e congela resultados", async () => {
      const a = await as(c, s.users.orient1, async () =>
        (await one(sql<{ id: string }>(c, "insert into assessments (program_id, team_id, occupation_id, type, title, held_on, scale, scale_max) values ($1, $2, $3, 'completo', 'Simulado dez', '2026-12-18', 'worldskills', 800) returning id", [s.programs.P1, s.teams.T1, O1]))).id,
      );
      const e0 = await expectError(as(c, s.users.orient1, () => sql(c, "select * from publish_assessment($1)", [a])));
      expect(e0).toMatch(/ao menos uma nota/);
      const e1 = await expectError(as(c, s.users.orient1, () => sql(c, "insert into assessment_results (assessment_id, program_id, score) values ($1, $2, 801)", [a, s.programs.P1])));
      expect(e1).toMatch(/acima do máximo/);
      await as(c, s.users.orient1, () => sql(c, "insert into assessment_results (assessment_id, program_id, score) values ($1, $2, 700)", [a, s.programs.P1]));
      await as(c, s.users.orient1, () => sql(c, "select * from publish_assessment($1)", [a]));
      const e2 = await expectError(as(c, s.users.orient1, () => sql(c, "update assessment_results set score = 750 where assessment_id = $1", [a])));
      expect(e2).toMatch(/não podem ser alteradas/);
      const e3 = await expectError(as(c, s.users.orient1, () => sql(c, "update assessments set scale_max = 100 where id = $1", [a])));
      expect(e3).toMatch(/imutável/);
      // erro só fecha com causa raiz e ação corretiva
      const e4 = await expectError(
        as(c, s.users.orient1, () => sql(c, "insert into assessment_errors (assessment_id, program_id, description, status) values ($1, $2, 'Falha na rede', 'concluida')", [a, s.programs.P1])),
      );
      expect(e4).toMatch(/assessment_errors_closed_ck/);

      // alerta: rampa de dezembro 720 (mesma escala) > 700
      await as(c, s.users.supA, () =>
        sql(c, "insert into score_targets (program_id, occupation_id, month, target, scale, source) values ($1, $2, '2026-12-01', 720, 'worldskills', 'proposta da supervisão')", [s.programs.P1, O1]),
      );
      await sql(c, "select * from refresh_alerts_ws()");
      const n = await sql(c, "select id from notifications where rule = 'nota_abaixo_rampa' and entity_id = $1 and user_id = $2", [a, s.users.supA]);
      expect(n).toHaveLength(1);
    });

    it("rampa: só supervisão define e a fonte é obrigatória", async () => {
      const e = await expectError(
        as(c, s.users.orient1, () => sql(c, "insert into score_targets (program_id, occupation_id, month, target, source) values ($1, $2, '2027-01-01', 730, 'x x x')", [s.programs.P1, O1])),
      );
      expect(e).toMatch(/row-level/);
      const e2 = await expectError(
        as(c, s.users.supA, () => sql(c, "insert into score_targets (program_id, occupation_id, month, target, source) values ($1, $2, '2027-01-15', 730, 'fonte')", [s.programs.P1, O1])),
      );
      expect(e2).toMatch(/score_targets_month_check/);
    });
  });

  describe("fechamento semanal (RF06)", () => {
    it("orientador envia; só supervisão aprova/devolve; aprovado é imutável; correção cria versão", async () => {
      const r = await as(c, s.users.orient1, async () =>
        (await one(sql<{ id: string }>(c, "insert into weekly_reports (program_id, team_id, week_start, planned_minutes, actual_minutes) values ($1, $2, '2026-11-30', 2400, 2100) returning id", [s.programs.P1, s.teams.T1]))).id,
      );
      const bad = await expectError(as(c, s.users.orient1, () => sql(c, "select * from set_weekly_report_status($1, 'enviado')", [r])));
      expect(bad).toMatch(/resultados e próximas entregas/);
      await as(c, s.users.orient1, () => sql(c, "update weekly_reports set outcomes = 'Concluído módulo CLP', next_steps = 'Simulado parcial' where id = $1", [r]));
      const direct = await expectError(as(c, s.users.orient1, () => sql(c, "update weekly_reports set status = 'aprovado' where id = $1", [r])));
      expect(direct).toMatch(/fluxo/);
      await as(c, s.users.orient1, () => sql(c, "select * from set_weekly_report_status($1, 'enviado')", [r]));
      const noSup = await expectError(as(c, s.users.orient1, () => sql(c, "select * from set_weekly_report_status($1, 'aprovado')", [r])));
      expect(noSup).toMatch(/Somente a supervisão/);
      const devNoNote = await expectError(as(c, s.users.supA, () => sql(c, "select * from set_weekly_report_status($1, 'devolvido', '')", [r])));
      expect(devNoNote).toMatch(/orientação/);
      await as(c, s.users.supA, () => sql(c, "select * from set_weekly_report_status($1, 'devolvido', 'Detalhar horas')", [r]));
      await as(c, s.users.orient1, () => sql(c, "update weekly_reports set outcomes = 'Concluído módulo CLP (12h)' where id = $1", [r]));
      await as(c, s.users.orient1, () => sql(c, "select * from set_weekly_report_status($1, 'enviado')", [r]));
      await as(c, s.users.supA, () => sql(c, "select * from set_weekly_report_status($1, 'aprovado', 'ok')", [r]));
      const locked = await expectError(as(c, s.users.orient1, () => sql(c, "update weekly_reports set blockers = 'x' where id = $1", [r])));
      expect(locked).toMatch(/correção/);
      const [v2] = await as(c, s.users.orient1, () => sql<{ version: number; status: string }>(c, "select * from correct_weekly_report($1)", [r]));
      expect(v2).toMatchObject({ version: 2, status: "rascunho" });
      expect(await as(c, s.users.comp2, () => sql(c, "select id from weekly_reports where team_id = $1", [s.teams.T1]))).toHaveLength(0);
    });

    it("semana precisa começar na segunda-feira", async () => {
      const e = await expectError(
        as(c, s.users.orient1, () => sql(c, "insert into weekly_reports (program_id, team_id, week_start) values ($1, $2, '2026-12-02')", [s.programs.P1, s.teams.T1])),
      );
      expect(e).toMatch(/week_start_check/);
    });
  });
});
