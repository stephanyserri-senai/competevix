/**
 * Etapa 4 (PRD §12, item 4): recursos, orçamento, benchmarking e riscos.
 * Aceite: saldo reconciliado (sem dupla contagem) e permissões respeitadas.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { as, connect, expectError, hasDb, sql } from "./helpers";
import { buildScenario, type Scenario } from "./fixtures";

describe.skipIf(!hasDb)("Etapa 4 — recursos, orçamento, benchmarking e riscos", () => {
  let c: Client;
  let s: Scenario;
  const one = async <T,>(p: Promise<T[]>) => (await p)[0];
  const P = () => s.programs.P1;

  beforeAll(async () => {
    c = await connect();
    s = await buildScenario(c);
  });
  afterAll(async () => c?.end());

  describe("orçamento", () => {
    let item: string, commit: string;
    const tx = (user: string, type: string, amount: number, parent: string | null = null) =>
      as(c, user, async () => (await one(sql<{ id: string }>(c, "insert into budget_transactions (item_id, program_id, type, amount, occurred_on, parent_id) values ($1, $2, $3, $4, '2026-12-01', $5) returning id", [item, P(), type, amount, parent]))).id);
    const summary = () => as(c, s.users.supA, async () => one(sql<Record<string, string>>(c, "select * from budget_item_summary where item_id = $1", [item])));

    it("saldo = aprovado − compromissos em aberto − realizado, sem dupla contagem", async () => {
      item = await as(c, s.users.supA, async () => (await one(sql<{ id: string }>(c, "insert into budget_items (program_id, category, description, estimated) values ($1, 'insumos', 'Kit de sensores', 1200) returning id", [P()]))).id);
      await tx(s.users.supA, "solicitado", 1100);
      await tx(s.users.gestaoA, "aprovado", 1000); // gestão registra aprovação (delegação)
      commit = await tx(s.users.supA, "comprometido", 600);
      await tx(s.users.supA, "realizado", 400, commit); // consome parte do compromisso
      await tx(s.users.supA, "realizado", 100); // realizado direto (sem compromisso)
      const r = await summary();
      expect(r).toMatchObject({ requested: "1100.00", approved: "1000.00", committed: "600.00", realized: "500.00", open_commitments: "200.00", balance: "300.00" });
    });

    it("realizado acima do compromisso vinculado é recusado; lançamentos são imutáveis", async () => {
      const over = await expectError(tx(s.users.supA, "realizado", 300, commit));
      expect(over).toMatch(/excede o compromisso/);
      const wrongType = await expectError(tx(s.users.supA, "aprovado", 10, commit));
      expect(wrongType).toMatch(/Só lançamentos realizados/);
      const imm = await expectError(as(c, s.users.supA, () => sql(c, "update budget_transactions set amount = 1 where id = $1", [commit])));
      expect(imm).toMatch(/imutável/);
      const linked = await expectError(as(c, s.users.supA, () => sql(c, "update budget_transactions set cancelled_at = now(), cancel_note = 'erro' where id = $1", [commit])));
      expect(linked).toMatch(/realizado vinculado/);
    });

    it("cancelamento lógico sai do saldo e exige justificativa", async () => {
      const t = await tx(s.users.supA, "comprometido", 50);
      expect((await summary()).balance).toBe("250.00");
      const noNote = await expectError(as(c, s.users.supA, () => sql(c, "update budget_transactions set cancelled_at = now() where id = $1", [t])));
      expect(noNote).toMatch(/budget_tx_cancel_ck/);
      await as(c, s.users.supA, () => sql(c, "update budget_transactions set cancelled_at = now(), cancel_note = 'lançado em duplicidade' where id = $1", [t]));
      expect((await summary()).balance).toBe("300.00");
    });

    it("orçamento é restrito à supervisão e gestão do programa; gestão só registra aprovação", async () => {
      expect(await as(c, s.users.orient1, () => sql(c, "select * from budget_items"))).toHaveLength(0);
      expect(await as(c, s.users.comp1, () => sql(c, "select * from budget_item_summary"))).toHaveLength(0);
      expect(await as(c, s.users.supB, () => sql(c, "select * from budget_transactions"))).toHaveLength(0);
      const g = await expectError(tx(s.users.gestaoA, "realizado", 1));
      expect(g).toMatch(/row-level/);
    });
  });

  describe("recursos e solicitações", () => {
    let res: string, req: string;
    it("inventário por unidade: supervisão da unidade mantém; equipe da unidade lê; outra unidade não", async () => {
      res = await as(c, s.users.supA, async () => (await one(sql<{ id: string }>(c, "insert into resources (unit_id, type, name, bookable) values ($1, 'ambiente', 'Laboratório 4.0', true) returning id", [s.units.A]))).id);
      const e = await expectError(as(c, s.users.supA, () => sql(c, "insert into resources (unit_id, type, name) values ($1, 'insumo', 'Cabo')", [s.units.B])));
      expect(e).toMatch(/row-level/);
      expect(await as(c, s.users.orient1, () => sql(c, "select id from resources where id = $1", [res]))).toHaveLength(1);
      expect(await as(c, s.users.supB, () => sql(c, "select id from resources where id = $1", [res]))).toHaveLength(0);
      expect(await as(c, s.users.comp1, () => sql(c, "select id from resources where id = $1", [res]))).toHaveLength(0);
    });

    it("ambiente reservado na agenda precisa ser reservável e da mesma unidade", async () => {
      await as(c, s.users.supA, () => sql(c, "insert into events (program_id, title, starts_at, ends_at, resource_id) values ($1, 'Treino no lab', now(), now() + interval '2 hours', $2)", [P(), res]));
      const resB = (await one(sql<{ id: string }>(c, "insert into resources (unit_id, type, name, bookable) values ($1, 'ambiente', 'Sala B', true) returning id", [s.units.B]))).id;
      const e = await expectError(as(c, s.users.supA, () => sql(c, "insert into events (program_id, title, starts_at, ends_at, resource_id) values ($1, 'Fora', now(), now() + interval '1 hour', $2)", [P(), resB])));
      expect(e).toMatch(/mesma unidade/);
    });

    it("fluxo: orientador envia; só supervisão analisa e decide (com decisor e data); rejeição exige motivo", async () => {
      req = await as(c, s.users.orient1, async () =>
        (await one(sql<{ id: string }>(c, "insert into resource_requests (program_id, team_id, title, justification, blocking, needs_analysis) values ($1, $2, 'Movimentar Smart 4.0', 'Necessidade a analisar (PRD RF09)', true, true) returning id", [P(), s.teams.T1]))).id,
      );
      const direct = await expectError(as(c, s.users.orient1, () => sql(c, "update resource_requests set status = 'aprovada' where id = $1", [req])));
      expect(direct).toMatch(/fluxo/);
      await as(c, s.users.orient1, () => sql(c, "select * from set_request_status($1, 'enviada')", [req]));
      const edit = await expectError(as(c, s.users.orient1, () => sql(c, "update resource_requests set quantity = 3 where id = $1", [req])));
      expect(edit).toMatch(/não pode ser editada/);
      const notSup = await expectError(as(c, s.users.orient1, () => sql(c, "select * from set_request_status($1, 'aprovada')", [req])));
      expect(notSup).toMatch(/não permite/);
      const skip = await expectError(as(c, s.users.supA, () => sql(c, "select * from set_request_status($1, 'atendida')", [req])));
      expect(skip).toMatch(/Transição não permitida/);
      const rej = await expectError(as(c, s.users.supA, () => sql(c, "select * from set_request_status($1, 'rejeitada', '')", [req])));
      expect(rej).toMatch(/motivo/);
      await as(c, s.users.supA, () => sql(c, "select * from set_request_status($1, 'em_analise')", [req]));

      await sql(c, "select * from refresh_alerts_ops()");
      expect(await sql(c, "select id from notifications where rule = 'recurso_bloqueante' and entity_id = $1 and resolved_at is null", [req])).toHaveLength(1);

      const [r] = await as(c, s.users.supA, () => sql<{ decided_by: string; decided_at: string }>(c, "select * from set_request_status($1, 'aprovada', 'liberado pela gestão')", [req]));
      expect(r.decided_by).toBe(s.users.supA);
      expect(r.decided_at).toBeTruthy();
      await as(c, s.users.supA, () => sql(c, "select * from set_request_status($1, 'atendida')", [req]));
      await sql(c, "select * from refresh_alerts_ops()");
      expect(await sql(c, "select id from notifications where rule = 'recurso_bloqueante' and entity_id = $1 and resolved_at is null", [req])).toHaveLength(0);
      const hist = await as(c, s.users.comp1, () => sql(c, "select to_status from request_history where request_id = $1 order by id", [req]));
      expect(hist.map((h) => (h as { to_status: string }).to_status)).toEqual(["enviada", "em_analise", "aprovada", "atendida"]);
      expect(await as(c, s.users.comp2, () => sql(c, "select id from resource_requests where id = $1", [req]))).toHaveLength(0);
    });
  });

  describe("riscos", () => {
    it("probabilidade e impacto 1–5, pontuação calculada, histórico de reavaliação e fechamento com mitigação", async () => {
      const bad = await expectError(as(c, s.users.supA, () => sql(c, "insert into risks (program_id, title, probability, impact) values ($1, 'Falta de insumo', 6, 3)", [P()])));
      expect(bad).toMatch(/probability_check/);
      const [k] = await as(c, s.users.supA, () => sql<{ id: string; score: number }>(c, "insert into risks (program_id, title, probability, impact) values ($1, 'Falta de insumo', 4, 4) returning id, score", [P()]));
      expect(k.score).toBe(16);
      await as(c, s.users.supA, () => sql(c, "select * from review_risk($1, 2::smallint, 4::smallint, 'mitigando', 'compra emergencial aprovada')", [k.id]));
      const close = await expectError(as(c, s.users.supA, () => sql(c, "select * from review_risk($1, 1::smallint, 1::smallint, 'fechado', 'ok')", [k.id])));
      expect(close).toMatch(/risks_closed_ck/);
      const hist = await as(c, s.users.supA, () => sql<{ probability: number; note: string | null }>(c, "select probability, note from risk_reviews where risk_id = $1 order by id", [k.id]));
      expect(hist).toEqual([{ probability: 4, note: null }, { probability: 2, note: "compra emergencial aprovada" }]);
      expect(await as(c, s.users.supB, () => sql(c, "select id from risks where id = $1", [k.id]))).toHaveLength(0);
    });
  });

  describe("benchmarking", () => {
    it("realizado exige achados; ação derivada do mesmo programa; competidor não lê", async () => {
      const b = await as(c, s.users.supA, async () => (await one(sql<{ id: string }>(c, "insert into benchmarks (program_id, reference, objective) values ($1, 'SENAI MG — Indústria 4.0', 'Conhecer rotina de treino') returning id", [P()]))).id);
      const e = await expectError(as(c, s.users.supA, () => sql(c, "update benchmarks set status = 'realizado' where id = $1", [b])));
      expect(e).toMatch(/benchmarks_done_ck/);
      await as(c, s.users.supA, () => sql(c, "update benchmarks set status = 'realizado', findings = 'Simulado completo toda sexta' where id = $1", [b]));
      await as(c, s.users.supA, () => sql(c, "insert into benchmark_actions (benchmark_id, action_id, program_id) values ($1, $2, $3)", [b, s.actions.aP1General, P()]));
      const cross = await expectError(as(c, s.users.supA, () => sql(c, "insert into benchmark_actions (benchmark_id, action_id, program_id) values ($1, $2, $3)", [b, s.actions.aP2, P()])));
      expect(cross).toMatch(/foreign key|row-level/);
      expect(await as(c, s.users.comp1, () => sql(c, "select id from benchmarks"))).toHaveLength(0);
      expect(await as(c, s.users.orient1, () => sql(c, "select id from benchmarks where id = $1", [b]))).toHaveLength(1);
    });
  });
});
