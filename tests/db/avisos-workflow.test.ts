/** Avisos do workflow: validação → supervisão; aprovada/devolvida → responsável. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { as, connect, hasDb, sql } from "./helpers";
import { buildScenario, type Scenario } from "./fixtures";

describe.skipIf(!hasDb)("Avisos do workflow de ações", () => {
  let c: Client;
  let s: Scenario;
  beforeAll(async () => {
    c = await connect();
    s = await buildScenario(c);
  });
  afterAll(async () => c?.end());

  const notes = (user: string, id: string) =>
    as(c, user, () => sql<{ rule: string; resolved_at: string | null; title: string }>(c, "select rule, resolved_at, title from notifications where entity_id = $1 order by created_at", [id]));
  const create = () =>
    as(c, s.users.orient1, async () => (await sql<{ id: string }>(c, "insert into actions (program_id, team_id, title, owner_person_id) values ($1, $2, 'Montar posto', $3) returning id", [s.programs.P1, s.teams.T1, s.people.pOrient1]))[0].id);

  it("envio para validação avisa a supervisão; aprovação resolve e avisa o responsável", async () => {
    const id = await create();
    await as(c, s.users.orient1, () => sql(c, "select * from move_action($1, 'em_validacao')", [id]));
    const sup = await notes(s.users.supA, id);
    expect(sup).toHaveLength(1);
    expect(sup[0]).toMatchObject({ rule: "acao_em_validacao", resolved_at: null });
    expect(await notes(s.users.orient1, id)).toHaveLength(0); // quem enviou não é avisado
    expect(await notes(s.users.supB, id)).toHaveLength(0); // supervisão de outra frente não

    await as(c, s.users.supA, () => sql(c, "select * from move_action($1, 'concluida')", [id]));
    expect((await notes(s.users.supA, id))[0].resolved_at).not.toBeNull();
    const own = await notes(s.users.orient1, id);
    expect(own.map((n) => n.rule)).toEqual(["acao_aprovada"]);
  });

  it("devolução avisa o responsável com a orientação", async () => {
    const id = await create();
    await as(c, s.users.orient1, () => sql(c, "select * from move_action($1, 'em_validacao')", [id]));
    await as(c, s.users.supA, () => sql(c, "select * from move_action($1, 'em_andamento', 'faltou foto')", [id]));
    const own = await notes(s.users.orient1, id);
    expect(own).toHaveLength(1);
    expect(own[0].rule).toBe("acao_devolvida");
    expect(own[0].title).toMatch(/faltou foto/);
    expect((await notes(s.users.supA, id))[0].resolved_at).not.toBeNull();
  });
});
