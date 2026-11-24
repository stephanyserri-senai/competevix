/**
 * Critério de aceite da Etapa 1 (PRD §12): usuários de escopos diferentes não acessam
 * dados cruzados. Testa leitura, escrita e revogação para cada papel.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { as, asAnon, connect, expectError, hasDb, sql } from "./helpers";
import { buildScenario, type Scenario } from "./fixtures";

const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

describe.skipIf(!hasDb)("RLS — isolamento por escopo", () => {
  let c: Client;
  let s: Scenario;

  beforeAll(async () => {
    c = await connect();
    s = await buildScenario(c);
  });
  afterAll(async () => c?.end());

  it("visitante anônimo não lê nada", async () => {
    const err = await expectError(asAnon(c, () => sql(c, "select * from programs")));
    expect(err).toMatch(/permission denied/);
  });

  it("supervisão da Unidade A não enxerga programa, ações, equipes nem pessoas da Unidade B", async () => {
    await as(c, s.users.supA, async () => {
      const progs = ids(await sql(c, "select id from programs where id = any($1)", [[s.programs.P1, s.programs.P2, s.programs.P3]]));
      expect(progs).toEqual([s.programs.P1]);
      expect(await sql(c, "select id from actions where program_id = $1", [s.programs.P2])).toHaveLength(0);
      expect(await sql(c, "select id from teams where id = $1", [s.teams.T3])).toHaveLength(0);
      expect(await sql(c, "select id from people where id = $1", [s.people.pB])).toHaveLength(0);
      expect(await sql(c, "select id from actions where program_id = $1", [s.programs.P1])).toHaveLength(3);
    });
  });

  it("supervisão não grava em programa de outra unidade, mesmo informando o ID", async () => {
    const err = await expectError(
      as(c, s.users.supA, () => sql(c, "insert into actions (program_id, title) values ($1, 'invasão')", [s.programs.P2])),
    );
    expect(err).toMatch(/row-level security/);
    // UPDATE silencioso: 0 linhas afetadas
    await as(c, s.users.supA, async () => {
      const r = await c.query("update actions set title = 'x' where id = $1", [s.actions.aP2]);
      expect(r.rowCount).toBe(0);
    });
  });

  it("não é possível referenciar equipe de outro programa (integridade de escopo)", async () => {
    const err = await expectError(
      as(c, s.users.supA, () =>
        sql(c, "insert into actions (program_id, team_id, title) values ($1, $2, 'cruzada')", [s.programs.P1, s.teams.T3]),
      ),
    );
    expect(err).toMatch(/foreign key|row-level/);
  });

  it("gestão por unidade lê todos os programas da unidade e não escreve", async () => {
    await as(c, s.users.gestaoA, async () => {
      const progs = ids(await sql(c, "select id from programs"));
      expect(progs).toEqual([s.programs.P1, s.programs.P3].sort());
      expect(await sql(c, "select id from actions where program_id = $1", [s.programs.P1])).toHaveLength(3);
    });
    const err = await expectError(
      as(c, s.users.gestaoA, () => sql(c, "insert into actions (program_id, title) values ($1, 'gestão escreve')", [s.programs.P1])),
    );
    expect(err).toMatch(/row-level security/);
  });

  it("orientador vê ações gerais e da equipe que orienta, não de outras equipes", async () => {
    await as(c, s.users.orient1, async () => {
      const rows = ids(await sql(c, "select id from actions"));
      expect(rows).toEqual([s.actions.aP1General, s.actions.aT1].sort());
    });
  });

  it("orientador edita só a própria equipe e não cria ação geral do programa", async () => {
    await as(c, s.users.orient1, async () => {
      await sql(c, "insert into actions (program_id, team_id, title) values ($1, $2, 'do orientador')", [s.programs.P1, s.teams.T1]);
    });
    const e1 = await expectError(
      as(c, s.users.orient1, () => sql(c, "insert into actions (program_id, team_id, title) values ($1, $2, 'outra equipe')", [s.programs.P1, s.teams.T2])),
    );
    expect(e1).toMatch(/row-level security/);
    const e2 = await expectError(
      as(c, s.users.orient1, () => sql(c, "insert into actions (program_id, title) values ($1, 'geral')", [s.programs.P1])),
    );
    expect(e2).toMatch(/row-level security/);
  });

  it("competidor vê apenas registros da própria equipe e não escreve", async () => {
    await as(c, s.users.comp1, async () => {
      const rows = ids(await sql(c, "select id from actions"));
      expect(rows).not.toContain(s.actions.aP1General);
      expect(rows).not.toContain(s.actions.aT2);
      expect(rows).toContain(s.actions.aT1);
      expect(ids(await sql(c, "select id from teams"))).toEqual([s.teams.T1]);
    });
    const err = await expectError(
      as(c, s.users.comp1, () => sql(c, "insert into actions (program_id, team_id, title) values ($1, $2, 'competidor')", [s.programs.P1, s.teams.T1])),
    );
    expect(err).toMatch(/row-level security/);
  });

  it("administrador configura, mas não lê dados operacionais nem pessoas sem vínculo", async () => {
    await as(c, s.users.admin, async () => {
      expect((await sql(c, "select id from programs")).length).toBeGreaterThanOrEqual(3);
      expect(await sql(c, "select id from actions")).toHaveLength(0);
      expect(await sql(c, "select id from people")).toHaveLength(0);
      expect(await sql(c, "select id from teams")).toHaveLength(0);
    });
  });

  it("usuário sem vínculo não vê programas, ações nem perfis alheios", async () => {
    await as(c, s.users.outsider, async () => {
      expect(await sql(c, "select id from programs")).toHaveLength(0);
      expect(await sql(c, "select id from actions")).toHaveLength(0);
      expect(ids(await sql(c, "select id from profiles"))).toEqual([s.users.outsider]);
    });
  });

  it("papel não pode ser autoatribuído pelo cliente", async () => {
    const err = await expectError(
      as(c, s.users.outsider, () =>
        sql(c, "insert into memberships (user_id, program_id, role) values ($1, $2, 'supervisao')", [s.users.outsider, s.programs.P1]),
      ),
    );
    expect(err).toMatch(/row-level security/);
    const err2 = await expectError(
      as(c, s.users.supA, () => sql(c, "insert into platform_admins (user_id) values ($1)", [s.users.supA])),
    );
    expect(err2).toMatch(/permission denied|row-level/);
  });

  it("somente administradores alteram status do usuário e listam e-mails", async () => {
    const err = await expectError(
      as(c, s.users.supA, () => sql(c, "update profiles set active = false where id = $1", [s.users.supA])),
    );
    expect(err).toMatch(/administradores|próprio/);
    const err2 = await expectError(as(c, s.users.supA, () => sql(c, "select * from admin_list_users()")));
    expect(err2).toMatch(/administradores/);
    await as(c, s.users.admin, async () => {
      const rows = await sql<{ email: string }>(c, "select * from admin_list_users()");
      expect(rows.length).toBeGreaterThan(0);
    });
  });

  it("revogação de vínculo tem efeito imediato", async () => {
    await as(c, s.users.orient1, async () => {
      expect((await sql(c, "select id from actions")).length).toBeGreaterThan(0);
    });
    await as(c, s.users.admin, () =>
      sql(c, "update memberships set revoked_at = now(), revoked_by = $2 where id = $1", [s.memberships.orientMembership, s.users.admin]),
    );
    await as(c, s.users.orient1, async () => {
      expect(await sql(c, "select id from actions")).toHaveLength(0);
      expect(await sql(c, "select id from programs")).toHaveLength(0);
    });
  });

  it("perfil desativado perde todo acesso, mesmo com vínculos vigentes", async () => {
    await as(c, s.users.admin, () => sql(c, "update profiles set active = false where id = $1", [s.users.comp2]));
    await as(c, s.users.comp2, async () => {
      expect(await sql(c, "select id from actions")).toHaveLength(0);
      expect(await sql(c, "select id from units")).toHaveLength(0);
    });
  });

  it("vínculo fora da vigência não concede acesso", async () => {
    const [{ id: u }] = await sql<{ id: string }>(c, "select id from auth.users where id = $1", [s.users.outsider]);
    await sql(c, "insert into memberships (user_id, program_id, role, valid_from, valid_to) values ($1, $2, 'gestao', '2020-01-01', '2020-12-31')", [u, s.programs.P1]);
    await sql(c, "insert into memberships (user_id, program_id, role, valid_from) values ($1, $2, 'gestao', current_date + 30)", [u, s.programs.P1]);
    await as(c, u, async () => {
      expect(await sql(c, "select id from programs")).toHaveLength(0);
    });
  });

  it("escopo do programa é imutável", async () => {
    const err = await expectError(
      as(c, s.users.admin, () => sql(c, "update programs set unit_id = $2 where id = $1", [s.programs.P1, s.units.B])),
    );
    expect(err).toMatch(/escopo do programa/);
  });

  it("supervisão não vincula à equipe pessoa de outra unidade que não enxerga", async () => {
    const err = await expectError(
      as(c, s.users.supA, () =>
        sql(c, "insert into team_members (team_id, program_id, person_id, role) values ($1, $2, $3, 'competidor')", [s.teams.T1, s.programs.P1, s.people.pB]),
      ),
    );
    expect(err).toMatch(/escopo/);
  });
});

describe.skipIf(!hasDb)("RLS — INSERT … RETURNING (padrão do supabase-js)", () => {
  let c: Client;
  let s: Scenario;
  beforeAll(async () => {
    c = await connect();
    s = await buildScenario(c);
  });
  afterAll(async () => c?.end());

  it("supervisão cria pessoa, equipe, vínculo, evento, ação e documento recebendo a linha de volta", async () => {
    await as(c, s.users.supA, async () => {
      const [p] = await sql<{ id: string }>(c, "insert into people (unit_id, full_name, kind) values ($1, 'Nova Pessoa', 'aluno') returning id", [s.units.A]);
      const [t] = await sql<{ id: string }>(c, "insert into teams (program_id, name) values ($1, 'Equipe nova') returning id", [s.programs.P1]);
      await sql(c, "insert into team_members (team_id, program_id, person_id, role) values ($1, $2, $3, 'competidor') returning id", [t.id, s.programs.P1, p.id]);
      await sql(c, "insert into events (program_id, title, starts_at, ends_at) values ($1, 'Reunião', now(), now() + interval '1 hour') returning id", [s.programs.P1]);
      await sql(c, "insert into actions (program_id, title) values ($1, 'Nova ação') returning id", [s.programs.P1]);
      await sql(c, "insert into documents (program_id, title, original_name, storage_path, mime_type, size_bytes) values ($1, 'Doc', 'd.pdf', $2, 'application/pdf', 5) returning id", [s.programs.P1, `${s.programs.P1}/${crypto.randomUUID()}.pdf`]);
    });
  });

  it("supervisão por programa não cria programa; supervisão por unidade cria e recebe a linha", async () => {
    const e = await expectError(
      as(c, s.users.supA, () => sql(c, "insert into programs (competition_id, cycle_id, unit_id) values ($1, $2, $3) returning id", [s.competitions.inova, s.cycle, s.units.B])),
    );
    expect(e).toMatch(/row-level/);
    await sql(c, "insert into memberships (user_id, unit_id, role) values ($1, $2, 'supervisao')", [s.users.supB, s.units.B]);
    const [row] = await as(c, s.users.supB, () =>
      sql<{ id: string }>(c, "insert into programs (competition_id, cycle_id, unit_id) values ($1, $2, $3) returning id", [s.competitions.inova, s.cycle, s.units.B]),
    );
    expect(row.id).toBeTruthy();
  });
});

describe.skipIf(!hasDb)("Vínculo pessoa ↔ login", () => {
  let c: Client;
  let s: Scenario;
  beforeAll(async () => {
    c = await connect();
    s = await buildScenario(c);
  });
  afterAll(async () => c?.end());

  it("supervisão vincula por e-mail apenas usuário com vínculo na unidade", async () => {
    const [{ id: pid }] = await sql<{ id: string }>(c, "insert into people (unit_id, full_name, kind) values ($1, 'Sem login', 'aluno') returning id", [s.units.A]);
    const [{ email: outsiderEmail }] = await sql<{ email: string }>(c, "select email from auth.users where id = $1", [s.users.outsider]);
    const [{ email: supBEmail }] = await sql<{ email: string }>(c, "select email from auth.users where id = $1", [s.users.supB]);
    const [{ email: gestaoEmail }] = await sql<{ email: string }>(c, "select email from auth.users where id = $1", [s.users.gestaoA]);
    for (const email of [outsiderEmail, supBEmail]) {
      const e = await expectError(as(c, s.users.supA, () => sql(c, "select link_person_to_user($1, $2)", [pid, email])));
      expect(e).toMatch(/Nenhum usuário/);
    }
    await as(c, s.users.supA, () => sql(c, "select link_person_to_user($1, $2)", [pid, gestaoEmail]));
    const [{ user_id }] = await sql<{ user_id: string }>(c, "select user_id from people where id = $1", [pid]);
    expect(user_id).toBe(s.users.gestaoA);
    const e2 = await expectError(as(c, s.users.supB, () => sql(c, "select link_person_to_user($1, $2)", [pid, gestaoEmail])));
    expect(e2).toMatch(/escopo/);
  });
});

describe.skipIf(!hasDb)("Privilégios do papel anônimo", () => {
  it("anon não tem privilégio em nenhuma tabela nem RPC do esquema public", async () => {
    const c = await connect();
    try {
      const rows = await sql<{ table_name: string }>(
        c,
        `select table_name from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'`,
      );
      expect(rows).toHaveLength(0);
      const fns = await sql<{ proname: string }>(
        c,
        `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
           and p.prorettype <> 'trigger'::regtype`,
      );
      expect(fns).toHaveLength(0);
    } finally {
      await c.end();
    }
  });
});
