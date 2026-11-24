import type { Client } from "pg";
import { createUser, grant, sql } from "./helpers";

const code = (p: string) => `${p}${Math.random().toString(16).slice(2, 8).toUpperCase()}`;

/**
 * Cenário com duas unidades e três programas:
 *   P1 = WS × ciclo × Unidade A   (equipes T1 e T2)
 *   P2 = WS × ciclo × Unidade B   (equipe T3)
 *   P3 = INOVA × ciclo × Unidade A
 * Usuários: admin, supA (supervisão P1), supB (supervisão P2), gestaoA (gestão da Unidade A),
 * orient1 (orientador P1, orienta T1), comp1 (competidor P1 em T1), comp2 (competidor P1 em T2),
 * outsider (sem vínculo).
 */
export async function buildScenario(c: Client) {
  const [unitA] = await sql<{ id: string }>(c, "insert into units (code, name) values ($1, 'Unidade A (teste)') returning id", [code("UA")]);
  const [unitB] = await sql<{ id: string }>(c, "insert into units (code, name) values ($1, 'Unidade B (teste)') returning id", [code("UB")]);
  const [ws] = await sql<{ id: string }>(c, "insert into competitions (code, name, kind) values ($1, 'WS teste', 'worldskills') returning id", [code("WS")]);
  const [inova] = await sql<{ id: string }>(c, "insert into competitions (code, name, kind) values ($1, 'INOVA teste', 'inova') returning id", [code("IN")]);
  const [cycle] = await sql<{ id: string }>(c, "insert into cycles (code, name) values ($1, 'Ciclo teste') returning id", [code("CY")]);

  const prog = async (comp: string, unit: string) =>
    (await sql<{ id: string }>(c, "insert into programs (competition_id, cycle_id, unit_id) values ($1, $2, $3) returning id", [comp, cycle.id, unit]))[0].id;
  const P1 = await prog(ws.id, unitA.id);
  const P2 = await prog(ws.id, unitB.id);
  const P3 = await prog(inova.id, unitA.id);

  const team = async (program: string, name: string) =>
    (await sql<{ id: string }>(c, "insert into teams (program_id, name) values ($1, $2) returning id", [program, name]))[0].id;
  const T1 = await team(P1, "Equipe 1");
  const T2 = await team(P1, "Equipe 2");
  const T3 = await team(P2, "Equipe 3");

  const admin = await createUser(c, "admin");
  await sql(c, "insert into platform_admins (user_id) values ($1)", [admin]);
  const supA = await createUser(c, "supA");
  const supB = await createUser(c, "supB");
  const gestaoA = await createUser(c, "gestaoA");
  const orient1 = await createUser(c, "orient1");
  const comp1 = await createUser(c, "comp1");
  const comp2 = await createUser(c, "comp2");
  const outsider = await createUser(c, "outsider");

  await grant(c, supA, "supervisao", { programId: P1 });
  await grant(c, supB, "supervisao", { programId: P2 });
  await grant(c, gestaoA, "gestao", { unitId: unitA.id });
  const orientMembership = await grant(c, orient1, "orientador", { programId: P1 });
  await grant(c, comp1, "competidor", { programId: P1 });
  await grant(c, comp2, "competidor", { programId: P1 });

  const person = async (unit: string, name: string, kind: string, user: string | null) =>
    (await sql<{ id: string }>(c, "insert into people (unit_id, full_name, kind, user_id) values ($1, $2, $3, $4) returning id", [unit, name, kind, user]))[0].id;
  const pOrient1 = await person(unitA.id, "Orientador Um", "docente", orient1);
  const pComp1 = await person(unitA.id, "Competidor Um", "aluno", comp1);
  const pComp2 = await person(unitA.id, "Competidor Dois", "aluno", comp2);
  const pB = await person(unitB.id, "Pessoa Unidade B", "aluno", null);

  const member = (teamId: string, program: string, personId: string, role: string) =>
    sql(c, "insert into team_members (team_id, program_id, person_id, role) values ($1, $2, $3, $4)", [teamId, program, personId, role]);
  await member(T1, P1, pOrient1, "orientador_titular");
  await member(T1, P1, pComp1, "competidor");
  await member(T2, P1, pComp2, "competidor");
  await member(T3, P2, pB, "competidor");

  const action = async (program: string, teamId: string | null, title: string) =>
    (await sql<{ id: string }>(c, "insert into actions (program_id, team_id, title) values ($1, $2, $3) returning id", [program, teamId, title]))[0].id;
  const aP1General = await action(P1, null, "Ação geral P1");
  const aT1 = await action(P1, T1, "Ação equipe 1");
  const aT2 = await action(P1, T2, "Ação equipe 2");
  const aP2 = await action(P2, T3, "Ação P2");

  return {
    units: { A: unitA.id, B: unitB.id },
    cycle: cycle.id,
    competitions: { ws: ws.id, inova: inova.id },
    programs: { P1, P2, P3 },
    teams: { T1, T2, T3 },
    users: { admin, supA, supB, gestaoA, orient1, comp1, comp2, outsider },
    people: { pOrient1, pComp1, pComp2, pB },
    actions: { aP1General, aT1, aT2, aP2 },
    memberships: { orientMembership },
  };
}

export type Scenario = Awaited<ReturnType<typeof buildScenario>>;
