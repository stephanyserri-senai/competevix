/**
 * Workflow de ações (decisão 25/11): A fazer → Em andamento → Em validação → Concluída.
 * Quem executa envia para validação; só a supervisão conclui ou devolve.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { as, connect, expectError, hasDb, sql } from "./helpers";
import { buildScenario, type Scenario } from "./fixtures";

describe.skipIf(!hasDb)("Workflow de ações com validação", () => {
  let c: Client;
  let s: Scenario;
  beforeAll(async () => {
    c = await connect();
    s = await buildScenario(c);
  });
  afterAll(async () => c?.end());

  const stage = async (id: string) =>
    (await as(c, s.users.supA, () => sql<{ stage: string; blocked: boolean }>(c, "select stage, blocked from actions_view where id = $1", [id])))[0];
  const create = (user: string, team: string | null = s.teams.T1, extra = "") =>
    as(c, user, async () => (await sql<{ id: string }>(c, `insert into actions (program_id, team_id, title, theme${extra ? ", requires_evidence" : ""}) values ($1, $2, 'Preparar posto', 'treino'${extra ? ", true" : ""}) returning id`, [s.programs.P1, team]))[0].id);

  it("orientador avança até a validação, mas não conclui; supervisão aprova", async () => {
    const id = await create(s.users.orient1);
    expect((await stage(id)).stage).toBe("a_fazer");
    await as(c, s.users.orient1, () => sql(c, "select * from move_action($1, 'em_andamento')", [id]));
    const direct = await expectError(as(c, s.users.orient1, () => sql(c, "select * from move_action($1, 'concluida')", [id])));
    expect(direct).toMatch(/Envie para validação/);
    await as(c, s.users.orient1, () => sql(c, "select * from move_action($1, 'em_validacao', 'posto montado')", [id]));
    expect((await stage(id)).stage).toBe("em_validacao");
    const [r] = await as(c, s.users.supA, () => sql<{ status: string; validated_by: string }>(c, "select * from move_action($1, 'concluida')", [id]));
    expect(r).toMatchObject({ status: "concluida", validated_by: s.users.supA });
    const hist = await as(c, s.users.supA, () => sql<{ kind: string; changes: { etapa?: string } | null; to_status: string | null }>(c, "select kind, changes, to_status from action_history where action_id = $1 order by id", [id]));
    expect(hist.some((h) => h.changes?.etapa === "enviada_validacao")).toBe(true);
    expect(hist.at(-1)).toMatchObject({ kind: "status", to_status: "concluida" });
  });

  it("devolução só pela supervisão e com orientação; volta para em andamento", async () => {
    const id = await create(s.users.orient1);
    await as(c, s.users.orient1, () => sql(c, "select * from move_action($1, 'em_validacao')", [id]));
    const notSup = await expectError(as(c, s.users.orient1, () => sql(c, "select * from move_action($1, 'em_andamento', 'quero voltar')", [id])));
    expect(notSup).toMatch(/Somente a supervisão devolve/);
    const noNote = await expectError(as(c, s.users.supA, () => sql(c, "select * from move_action($1, 'em_andamento')", [id])));
    expect(noNote).toMatch(/orientação/);
    await as(c, s.users.supA, () => sql(c, "select * from move_action($1, 'em_andamento', 'faltou foto do posto')", [id]));
    expect((await stage(id)).stage).toBe("em_andamento");
  });

  it("requisitos de conclusão valem já no envio para validação", async () => {
    const id = await create(s.users.orient1, s.teams.T1, "evid");
    const e = await expectError(as(c, s.users.orient1, () => sql(c, "select * from move_action($1, 'em_validacao')", [id])));
    expect(e).toMatch(/exige evidência/);
  });

  it("campos de validação não são alterados fora do fluxo; bloqueio não vale durante a validação", async () => {
    const id = await create(s.users.orient1);
    const e = await expectError(as(c, s.users.orient1, () => sql(c, "update actions set validation_requested_at = now() where id = $1", [id])));
    expect(e).toMatch(/fluxo de validação/);
    await as(c, s.users.orient1, () => sql(c, "select * from move_action($1, 'em_validacao')", [id]));
    const b = await expectError(as(c, s.users.orient1, () => sql(c, "select * from set_action_blocked($1, true, 'sem insumo')", [id])));
    expect(b).toMatch(/fora da validação/);
  });

  it("cancelamento exige motivo; competidor não move ações", async () => {
    const id = await create(s.users.orient1);
    const e = await expectError(as(c, s.users.orient1, () => sql(c, "select * from move_action($1, 'cancelada')", [id])));
    expect(e).toMatch(/motivo do cancelamento/);
    const comp = await expectError(as(c, s.users.comp1, () => sql(c, "select * from move_action($1, 'em_andamento')", [id])));
    expect(comp).toMatch(/Sem permissão/);
  });

  it("visão traz frente/unidade e prazo cumprido", async () => {
    const [{ id }] = await as(c, s.users.supA, () => sql<{ id: string }>(c, "insert into actions (program_id, title, due_date) values ($1, 'Com prazo', (now() at time zone 'America/Sao_Paulo')::date + 2) returning id", [s.programs.P1]));
    await as(c, s.users.supA, () => sql(c, "select * from move_action($1, 'concluida', 'ok')", [id]));
    const [v] = await as(c, s.users.supA, () => sql<{ completed_on_time: boolean; competition_id: string; unit_id: string }>(c, "select completed_on_time, competition_id, unit_id from actions_view where id = $1", [id]));
    expect(v).toMatchObject({ completed_on_time: true, competition_id: s.competitions.ws, unit_id: s.units.A });
  });
});
