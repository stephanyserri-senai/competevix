/**
 * Etapa 3 (PRD §12, item 3) — critérios de aceite: impedir notas fora do limite,
 * publicação incompleta e avanço sem evidência; manter histórico. Avaliador restrito
 * à banca atribuída (PRD §4).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { as, connect, createUser, expectError, grant, hasDb, sql } from "./helpers";
import { buildScenario, type Scenario } from "./fixtures";

describe.skipIf(!hasDb)("Etapa 3 — INOVA", () => {
  let c: Client;
  let s: Scenario;
  let supI: string, orientI: string, compI: string, av1: string, av2: string, avOutro: string;
  let TI: string, TI2: string, rubricVersion: string, leaves: { id: string; code: string; max: number }[];
  const one = async <T,>(p: Promise<T[]>) => (await p)[0];
  const P = () => s.programs.P3;

  beforeAll(async () => {
    c = await connect();
    s = await buildScenario(c);
    await sql(c, "select private.seed_inova_rubric()");
    // a fixture cria competição INOVA com código aleatório; a rubrica de referência fica ligada à competição INOVA "real".
    // Para o teste, cria uma rubrica para a competição do cenário a partir da função de cópia manual.
    const [{ id: rub }] = await sql<{ id: string }>(c, "insert into rubrics (competition_id, name) values ($1, 'Rubrica teste') returning id", [s.competitions.inova]);
    rubricVersion = (await one(sql<{ id: string }>(c, "insert into rubric_versions (rubric_id, version) values ($1, 1) returning id", [rub]))).id;
    const [{ id: g }] = await sql<{ id: string }>(c, "insert into rubric_criteria (version_id, code, name, max_score, position) values ($1, 'INOV', 'Inovação', 10, 0) returning id", [rubricVersion]);
    await sql(c, "insert into rubric_criteria (version_id, parent_id, code, name, max_score, position) values ($1, $2, 'I1', 'Originalidade', 5, 0), ($1, $2, 'I2', 'Impacto', 5, 1)", [rubricVersion, g]);
    await sql(c, "insert into rubric_criteria (version_id, code, name, max_score, position) values ($1, 'PITCH', 'Pitch', 30, 1)", [rubricVersion]);
    await sql(c, "update rubric_versions set status = 'publicada' where id = $1", [rubricVersion]);
    leaves = (await sql<{ id: string; code: string; max: string }>(c, "select id, code, max_score as max from rubric_criteria c where version_id = $1 and not exists (select 1 from rubric_criteria k where k.parent_id = c.id) order by code", [rubricVersion]))
      .map((l) => ({ id: l.id, code: l.code, max: Number(l.max) }));

    supI = await createUser(c, "supI");
    orientI = await createUser(c, "orientI");
    compI = await createUser(c, "compI");
    av1 = await createUser(c, "av1");
    av2 = await createUser(c, "av2");
    avOutro = await createUser(c, "avOutro");
    await grant(c, supI, "supervisao", { programId: P() });
    await grant(c, orientI, "orientador", { programId: P() });
    await grant(c, compI, "competidor", { programId: P() });
    await grant(c, av1, "avaliador", { programId: P() }, { validTo: "2099-12-31" });
    await grant(c, av2, "avaliador", { programId: P() }, { validTo: "2099-12-31" });
    TI = (await one(sql<{ id: string }>(c, "insert into teams (program_id, name) values ($1, 'Equipe INOVA') returning id", [P()]))).id;
    TI2 = (await one(sql<{ id: string }>(c, "insert into teams (program_id, name) values ($1, 'Equipe INOVA 2') returning id", [P()]))).id;
    const pe = async (name: string, user: string) =>
      (await one(sql<{ id: string }>(c, "insert into people (unit_id, full_name, kind, user_id) values ($1, $2, 'aluno', $3) returning id", [s.units.A, name, user]))).id;
    await sql(c, "insert into team_members (team_id, program_id, person_id, role) values ($1, $2, $3, 'orientador_titular')", [TI, P(), await pe("Orientador INOVA", orientI)]);
    await sql(c, "insert into team_members (team_id, program_id, person_id, role) values ($1, $2, $3, 'competidor')", [TI, P(), await pe("Competidor INOVA", compI)]);
  });
  afterAll(async () => c?.end());

  const newProject = (user: string, team = TI) =>
    as(c, user, async () => (await one(sql<{ id: string }>(c, "insert into projects (program_id, team_id, title, problem) values ($1, $2, 'Gêmeo digital', 'Perdas no processo') returning id", [P(), team]))).id);
  const evidence = (user: string, project: string, kind = "comparacao_mercado") =>
    sql(c, "insert into project_evidences (project_id, program_id, kind, description) values ($1, $2, $3, 'Levantamento com três concorrentes e preços')", [project, P(), kind]).then(() => undefined) as Promise<void>;

  describe("projetos e funil", () => {
    it("orientador cria projeto da própria equipe; não de outra; etapa não muda por edição direta", async () => {
      const p = await newProject(orientI);
      const e = await expectError(newProject(orientI, TI2));
      expect(e).toMatch(/row-level/);
      const e2 = await expectError(as(c, orientI, () => sql(c, "update projects set stage = 'selecao' where id = $1", [p])));
      expect(e2).toMatch(/fluxo de avanço/);
    });

    it("avanço exige evidência na etapa atual, revisão da supervisão e não admite saltos; retorno exige justificativa", async () => {
      const p = await newProject(orientI);
      const noEv = await expectError(as(c, supI, () => sql(c, "select * from advance_project_stage($1, 'selecao')", [p])));
      expect(noEv).toMatch(/ao menos uma evidência/);
      await as(c, orientI, () => evidence(orientI, p));
      const notSup = await expectError(as(c, orientI, () => sql(c, "select * from advance_project_stage($1, 'selecao')", [p])));
      expect(notSup).toMatch(/Somente a supervisão/);
      const jump = await expectError(as(c, supI, () => sql(c, "select * from advance_project_stage($1, 'prototipo')", [p])));
      expect(jump).toMatch(/uma etapa por vez/);
      await as(c, supI, () => sql(c, "select * from advance_project_stage($1, 'selecao', 'ok')", [p]));
      // evidência anterior não vale para a nova etapa
      const again = await expectError(as(c, supI, () => sql(c, "select * from advance_project_stage($1, 'anterioridade')", [p])));
      expect(again).toMatch(/ao menos uma evidência/);
      const back = await expectError(as(c, supI, () => sql(c, "select * from advance_project_stage($1, 'prospeccao', ' ')", [p])));
      expect(back).toMatch(/justificativa/);
      await as(c, supI, () => sql(c, "select * from advance_project_stage($1, 'prospeccao', 'problema mal definido')", [p]));
      const hist = await as(c, compI, () => sql<{ from_stage: string; to_stage: string; evidence_count: number }>(c, "select from_stage, to_stage, evidence_count from project_stage_history where project_id = $1 order by id", [p]));
      expect(hist).toEqual([
        { from_stage: "prospeccao", to_stage: "selecao", evidence_count: 1 },
        { from_stage: "selecao", to_stage: "prospeccao", evidence_count: 0 },
      ]);
    });

    it("histórico não é gravável pelo cliente e evidência curta sem anexo é recusada", async () => {
      const p = await newProject(orientI);
      const e = await expectError(as(c, supI, () => sql(c, "insert into project_stage_history (project_id, program_id, from_stage, to_stage, reviewer, evidence_count) values ($1, $2, 'prospeccao', 'prioritario', $3, 9)", [p, P(), supI])));
      expect(e).toMatch(/permission denied|row-level/);
      const e2 = await expectError(as(c, orientI, () => sql(c, "insert into project_evidences (project_id, program_id, kind, description) values ($1, $2, 'validacao_industrial', 'ok ok')", [p, P()])));
      expect(e2).toMatch(/mín\. 20/);
    });
  });

  describe("rubricas", () => {
    it("rubrica publicada é imutável; nova versão copia a árvore; grupo deve somar os critérios", async () => {
      const e = await expectError(as(c, supI, () => sql(c, "update rubric_criteria set max_score = 9 where version_id = $1 and code = 'PITCH'", [rubricVersion])));
      expect(e).toMatch(/imutável/);
      const [v2] = await as(c, supI, () => sql<{ id: string; version: number }>(c, "select * from new_rubric_version($1)", [rubricVersion]));
      expect(v2.version).toBe(2);
      const tree = await sql<{ code: string; parent: string | null }>(c, "select c.code, p.code as parent from rubric_criteria c left join rubric_criteria p on p.id = c.parent_id where c.version_id = $1 order by c.code", [v2.id]);
      expect(tree).toEqual([{ code: "I1", parent: "INOV" }, { code: "I2", parent: "INOV" }, { code: "INOV", parent: null }, { code: "PITCH", parent: null }]);
      await as(c, supI, () => sql(c, "update rubric_criteria set max_score = 12 where version_id = $1 and code = 'INOV'", [v2.id]));
      const bad = await expectError(as(c, supI, () => sql(c, "select * from publish_rubric_version($1)", [v2.id])));
      expect(bad).toMatch(/difere da soma/);
      const noPerm = await expectError(as(c, orientI, () => sql(c, "select * from publish_rubric_version($1)", [v2.id])));
      expect(noPerm).toMatch(/Sem permissão/);
    });

    it("a rubrica de referência do PRD é marcada como não oficial e soma 100", async () => {
      const [r] = await sql<{ official: boolean; total: string; leaves: number }>(c, `
        select r.official, sum(c.max_score) filter (where c.parent_id is null) total,
               count(*) filter (where not exists (select 1 from rubric_criteria k where k.parent_id = c.id))::int leaves
        from rubrics r join rubric_versions v on v.rubric_id = r.id join rubric_criteria c on c.version_id = v.id
        where r.name = 'Rubrica interna preliminar INOVA' group by r.official`);
      if (r) {
        expect(r.official).toBe(false);
        expect(Number(r.total)).toBe(100);
        expect(r.leaves).toBe(11);
      }
    });
  });

  describe("bancas e avaliadores", () => {
    let project: string, otherProject: string, panel: string, a1: string, a2: string;

    it("designação exige vínculo de avaliador vigente; avaliador só vê a banca e o projeto atribuídos", async () => {
      project = await newProject(orientI);
      otherProject = await newProject(supI, TI2);
      panel = await as(c, supI, async () => (await one(sql<{ id: string }>(c, "insert into panels (program_id, project_id, rubric_version_id, title, held_on) values ($1, $2, $3, 'Banca dez', '2026-12-15') returning id", [P(), project, rubricVersion]))).id);
      const e = await expectError(as(c, supI, () => sql(c, "insert into panel_assignments (panel_id, program_id, evaluator_id) values ($1, $2, $3)", [panel, P(), avOutro])));
      expect(e).toMatch(/vínculo vigente/);
      a1 = await as(c, supI, async () => (await one(sql<{ id: string }>(c, "insert into panel_assignments (panel_id, program_id, evaluator_id) values ($1, $2, $3) returning id", [panel, P(), av1]))).id);
      a2 = await as(c, supI, async () => (await one(sql<{ id: string }>(c, "insert into panel_assignments (panel_id, program_id, evaluator_id) values ($1, $2, $3) returning id", [panel, P(), av2]))).id);

      await as(c, av1, async () => {
        expect((await sql<{ id: string }>(c, "select id from projects")).map((r) => r.id)).toEqual([project]);
        expect((await sql<{ id: string }>(c, "select id from panels")).map((r) => r.id)).toEqual([panel]);
        expect((await sql<{ id: string }>(c, "select id from panel_assignments")).map((r) => r.id)).toEqual([a1]);
        expect(await sql(c, "select id from teams")).toHaveLength(0);
        expect(await sql(c, "select id from actions")).toHaveLength(0);
        expect(await sql(c, "select id from programs where id = $1", [P()])).toHaveLength(0);
      });
      expect(await as(c, av1, () => sql(c, "select id from projects where id = $1", [otherProject]))).toHaveLength(0);
    });

    it("notas fora do limite e nota em grupo são recusadas; avaliador não vê notas de outro", async () => {
      const over = await expectError(as(c, av1, () => sql(c, "insert into panel_scores (assignment_id, program_id, criterion_id, score) values ($1, $2, $3, 6)", [a1, P(), leaves.find((l) => l.code === "I1")!.id])));
      expect(over).toMatch(/acima do máximo/);
      const neg = await expectError(as(c, av1, () => sql(c, "insert into panel_scores (assignment_id, program_id, criterion_id, score) values ($1, $2, $3, -1)", [a1, P(), leaves[0].id])));
      expect(neg).toMatch(/panel_scores_score_check/);
      const [{ id: group }] = await sql<{ id: string }>(c, "select id from rubric_criteria where version_id = $1 and code = 'INOV'", [rubricVersion]);
      const grp = await expectError(as(c, av1, () => sql(c, "insert into panel_scores (assignment_id, program_id, criterion_id, score) values ($1, $2, $3, 8)", [a1, P(), group])));
      expect(grp).toMatch(/não o grupo/);
      const other = await expectError(as(c, av1, () => sql(c, "insert into panel_scores (assignment_id, program_id, criterion_id, score) values ($1, $2, $3, 3)", [a2, P(), leaves[0].id])));
      expect(other).toMatch(/row-level/);
      await as(c, av2, () => sql(c, "insert into panel_scores (assignment_id, program_id, criterion_id, score) values ($1, $2, $3, 4)", [a2, P(), leaves[0].id]));
      expect(await as(c, av1, () => sql(c, "select * from panel_scores"))).toHaveLength(0);
    });

    it("envio exige todos os critérios; enviado é imutável; publicação incompleta é bloqueada", async () => {
      await as(c, av1, () => sql(c, "insert into panel_scores (assignment_id, program_id, criterion_id, score) values ($1, $2, $3, 5)", [a1, P(), leaves.find((l) => l.code === "I1")!.id]));
      const miss = await expectError(as(c, av1, () => sql(c, "select * from submit_panel_evaluation($1)", [a1])));
      expect(miss).toMatch(/Faltam 2 critério/);
      await as(c, av1, () => sql(c, "insert into panel_scores (assignment_id, program_id, criterion_id, score) values ($1, $2, $3, 4), ($1, $2, $4, 28)", [a1, P(), leaves.find((l) => l.code === "I2")!.id, leaves.find((l) => l.code === "PITCH")!.id]));
      const notMine = await expectError(as(c, av2, () => sql(c, "select * from submit_panel_evaluation($1)", [a1])));
      expect(notMine).toMatch(/avaliador designado/);
      await as(c, av1, () => sql(c, "select * from submit_panel_evaluation($1, 'Bom potencial')", [a1]));
      const locked = await expectError(as(c, av1, () => sql(c, "update panel_scores set score = 1 where assignment_id = $1", [a1])));
      expect(locked).toMatch(/imutáveis/);
      // orientador não vê notas antes da publicação
      expect(await as(c, orientI, () => sql(c, "select * from panel_scores"))).toHaveLength(0);
      const incomplete = await expectError(as(c, supI, () => sql(c, "select * from publish_panel($1)", [panel])));
      expect(incomplete).toMatch(/não concluídas/);
      // remove a designação pendente e publica
      await as(c, supI, () => sql(c, "delete from panel_assignments where id = $1", [a2]));
      await as(c, supI, () => sql(c, "select * from publish_panel($1)", [panel]));
      const imm = await expectError(as(c, supI, () => sql(c, "update panels set title = 'outro' where id = $1", [panel])));
      expect(imm).toMatch(/imutável/);
      expect((await as(c, orientI, () => sql(c, "select * from panel_scores"))).length).toBe(3);
    });

    it("revisão cria nova versão; priorizar só exige evidência e revisão da supervisão", async () => {
      const [v2] = await as(c, supI, () => sql<{ id: string; version: number; supersedes_id: string }>(c, "select * from revise_panel($1, 'Nota de pitch contestada')", [panel]));
      expect(v2).toMatchObject({ version: 2, supersedes_id: panel });
      const [{ status }] = await sql<{ status: string }>(c, "select status from panels where id = $1", [panel]);
      expect(status).toBe("substituida");

      // leva outro projeto até banca_pitch e tenta priorizar sem banca publicada
      const p = otherProject;
      const stages = ["selecao", "anterioridade", "validacao_problema", "prototipo", "validacao_tecnica_financeira", "banca_pitch"];
      for (const st of stages) {
        await as(c, supI, () => evidence(supI, p));
        await as(c, supI, () => sql(c, "select * from advance_project_stage($1, $2)", [p, st]));
      }
      await as(c, supI, () => evidence(supI, p, "validacao_industrial"));
      // decisão 25/11: priorizar não depende de banca no portal (avaliação oficial é no evento)
      const [row] = await as(c, supI, () => sql<{ stage: string }>(c, "select * from advance_project_stage($1, 'prioritario', 'aprovado internamente')", [p]));
      expect(row.stage).toBe("prioritario");
    });

    it("vínculo de avaliador vencido ou revogado encerra o acesso", async () => {
      await sql(c, "update memberships set revoked_at = now() where user_id = $1", [av1]);
      expect(await as(c, av1, () => sql(c, "select id from panels"))).toHaveLength(0);
      expect(await as(c, av1, () => sql(c, "select id from projects"))).toHaveLength(0);
    });
  });

  describe("simulação interna e resultado no evento (decisão 25/11)", () => {
    it("orientador simula a avaliação do próprio projeto sem avaliador externo", async () => {
      const p = await newProject(orientI);
      const other = await newProject(supI, TI2);
      const sim = await as(c, orientI, async () => (await one(sql<{ id: string }>(c, "insert into panels (program_id, project_id, rubric_version_id, title, held_on) values ($1, $2, $3, 'Simulação interna', '2026-12-10') returning id", [P(), p, rubricVersion]))).id);
      const e = await expectError(as(c, orientI, () => sql(c, "insert into panels (program_id, project_id, rubric_version_id, title, held_on) values ($1, $2, $3, 'Outra equipe', '2026-12-10')", [P(), other, rubricVersion])));
      expect(e).toMatch(/row-level/);
      const a = await as(c, orientI, async () => (await one(sql<{ id: string }>(c, "insert into panel_assignments (panel_id, program_id, evaluator_id) values ($1, $2, $3) returning id", [sim, P(), orientI]))).id);
      const comp = await expectError(as(c, orientI, () => sql(c, "insert into panel_assignments (panel_id, program_id, evaluator_id) values ($1, $2, $3)", [sim, P(), compI])));
      expect(comp).toMatch(/vínculo vigente/);
      await as(c, orientI, () => sql(c, "insert into panel_scores (assignment_id, program_id, criterion_id, score) select $1, $2, id, 1 from rubric_criteria c where version_id = $3 and not exists (select 1 from rubric_criteria k where k.parent_id = c.id)", [a, P(), rubricVersion]));
      await as(c, orientI, () => sql(c, "select * from submit_panel_evaluation($1)", [a]));
      await as(c, orientI, () => sql(c, "select * from publish_panel($1)", [sim]));
      expect((await as(c, compI, () => sql(c, "select * from panel_scores where assignment_id = $1", [a]))).length).toBe(3);
    });

    it("resultado oficial do evento: equipe registra e lê; limites de nota; outra equipe não vê", async () => {
      const p = await newProject(orientI);
      await as(c, orientI, () => sql(c, "insert into project_results (project_id, program_id, level, held_on, total_score, innovation_score, placement) values ($1, $2, 'estadual', '2027-10-20', 96.5, 38.5, 1)", [p, P()]));
      const over = await expectError(as(c, orientI, () => sql(c, "insert into project_results (project_id, program_id, level, held_on, total_score) values ($1, $2, 'nacional', '2027-11-20', 101)", [p, P()])));
      expect(over).toMatch(/total_score_check/);
      const empty = await expectError(as(c, orientI, () => sql(c, "insert into project_results (project_id, program_id, level, held_on) values ($1, $2, 'nacional', '2027-11-20')", [p, P()])));
      expect(empty).toMatch(/project_results_content_ck/);
      expect(await as(c, compI, () => sql(c, "select id from project_results where project_id = $1", [p]))).toHaveLength(1);
      expect(await as(c, s.users.comp2, () => sql(c, "select id from project_results where project_id = $1", [p]))).toHaveLength(0);
    });
  });
});
