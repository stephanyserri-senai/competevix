/**
 * Regras de negócio aplicadas no banco (PRD §8, §9): fluxo de ações, dependências sem ciclo,
 * evidências, checklists versionados, documentos/storage, agenda, alertas e auditoria.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { randomUUID } from "node:crypto";
import { as, connect, expectError, hasDb, sql } from "./helpers";
import { buildScenario, type Scenario } from "./fixtures";

describe.skipIf(!hasDb)("Regras de negócio no banco", () => {
  let c: Client;
  let s: Scenario;

  beforeAll(async () => {
    c = await connect();
    s = await buildScenario(c);
  });
  afterAll(async () => c?.end());

  const newAction = (title: string, extra = "") =>
    as(c, s.users.supA, async () =>
      (await sql<{ id: string }>(c, `insert into actions (program_id, title${extra ? ", " + extra.split("=")[0] : ""}) values ($1, $2${extra ? ", " + extra.split("=")[1] : ""}) returning id`, [s.programs.P1, title]))[0].id,
    );

  describe("Ações", () => {
    it("ação nasce aberta e registra histórico de criação", async () => {
      const id = await newAction("Histórico");
      const hist = await as(c, s.users.supA, () => sql<{ kind: string }>(c, "select kind from action_history where action_id = $1", [id]));
      expect(hist.map((h) => h.kind)).toEqual(["criada"]);
      const e = await expectError(
        as(c, s.users.supA, () => sql(c, "insert into actions (program_id, title, status) values ($1, 'já concluída', 'concluida')", [s.programs.P1])),
      );
      expect(e).toMatch(/começar em aberto/);
    });

    it("bloqueio exige motivo e conclusão registra autor e instante", async () => {
      const id = await newAction("Bloqueio");
      const e = await expectError(as(c, s.users.supA, () => sql(c, "select set_action_status($1, 'bloqueada', null)", [id])));
      expect(e).toMatch(/actions_blocked_ck/);
      await as(c, s.users.supA, () => sql(c, "select set_action_status($1, 'bloqueada', 'aguardando insumo')", [id]));
      await as(c, s.users.supA, () => sql(c, "select set_action_status($1, 'em_andamento', null)", [id]));
      const [row] = await as(c, s.users.supA, () =>
        sql<{ status: string; completed_by: string; blocked_reason: string | null }>(c, "select * from set_action_status($1, 'concluida', 'feito')", [id]),
      );
      expect(row.status).toBe("concluida");
      expect(row.completed_by).toBe(s.users.supA);
      expect(row.blocked_reason).toBeNull();
    });

    it("transição inválida é rejeitada e reabertura exige justificativa auditada", async () => {
      const id = await newAction("Reabertura");
      await as(c, s.users.supA, () => sql(c, "select set_action_status($1, 'cancelada', 'não se aplica')", [id]));
      const e = await expectError(as(c, s.users.supA, () => sql(c, "select set_action_status($1, 'em_andamento', null)", [id])));
      expect(e).toMatch(/Transição/);
      const e2 = await expectError(as(c, s.users.supA, () => sql(c, "select set_action_status($1, 'aberta', '  ')", [id])));
      expect(e2).toMatch(/justificativa/);
      await as(c, s.users.supA, () => sql(c, "select set_action_status($1, 'aberta', 'retomada após reunião')", [id]));
      const hist = await as(c, s.users.supA, () =>
        sql<{ from_status: string; to_status: string; note: string; actor: string }>(c, "select from_status, to_status, note, actor from action_history where action_id = $1 and kind = 'status' order by id", [id]),
      );
      expect(hist.at(-1)).toMatchObject({ from_status: "cancelada", to_status: "aberta", note: "retomada após reunião", actor: s.users.supA });
    });

    it("ação encerrada não é editada sem reabrir", async () => {
      const id = await newAction("Encerrada");
      await as(c, s.users.supA, () => sql(c, "select set_action_status($1, 'concluida', 'ok')", [id]));
      const e = await expectError(as(c, s.users.supA, () => sql(c, "update actions set title = 'mudou' where id = $1", [id])));
      expect(e).toMatch(/reabra/);
    });

    it("dependências: sem ciclo e bloqueiam conclusão enquanto abertas", async () => {
      const a = await newAction("Ação A");
      const b = await newAction("Ação B");
      const d = await newAction("Ação D");
      await as(c, s.users.supA, () => sql(c, "insert into action_dependencies (action_id, depends_on_id, program_id) values ($1, $2, $3)", [b, a, s.programs.P1]));
      await as(c, s.users.supA, () => sql(c, "insert into action_dependencies (action_id, depends_on_id, program_id) values ($1, $2, $3)", [d, b, s.programs.P1]));
      const cyc = await expectError(
        as(c, s.users.supA, () => sql(c, "insert into action_dependencies (action_id, depends_on_id, program_id) values ($1, $2, $3)", [a, d, s.programs.P1])),
      );
      expect(cyc).toMatch(/ciclo/);
      const blocked = await expectError(as(c, s.users.supA, () => sql(c, "select set_action_status($1, 'concluida', 'x')", [b])));
      expect(blocked).toMatch(/dependência/);
      await as(c, s.users.supA, () => sql(c, "select set_action_status($1, 'concluida', 'x')", [a]));
      await as(c, s.users.supA, () => sql(c, "select set_action_status($1, 'concluida', 'x')", [b]));
      const [v] = await as(c, s.users.supA, () => sql<{ open_dependencies: number }>(c, "select open_dependencies from actions_view where id = $1", [d]));
      expect(v.open_dependencies).toBe(0);
    });

    it("dependência entre programas diferentes é impossível", async () => {
      const a = await newAction("Local");
      const e = await expectError(
        as(c, s.users.supA, () => sql(c, "insert into action_dependencies (action_id, depends_on_id, program_id) values ($1, $2, $3)", [a, s.actions.aP2, s.programs.P1])),
      );
      expect(e).toMatch(/foreign key|row-level/);
    });

    it("regra do programa: conclusão exige evidência quando configurado", async () => {
      await sql(c, "update programs set settings = '{\"acao_conclusao_exige\": \"evidencia\"}' where id = $1", [s.programs.P1]);
      const id = await newAction("Com evidência");
      const e = await expectError(as(c, s.users.supA, () => sql(c, "select set_action_status($1, 'concluida', 'só texto')", [id])));
      expect(e).toMatch(/evidência/);
      await as(c, s.users.supA, () =>
        sql(c, "insert into action_evidences (action_id, program_id, url, note) values ($1, $2, 'https://exemplo.invalid/ata', 'ata')", [id, s.programs.P1]),
      );
      await as(c, s.users.supA, () => sql(c, "select set_action_status($1, 'concluida', 'com ata')", [id]));
      await sql(c, "update programs set settings = '{}' where id = $1", [s.programs.P1]);
    });

    it("atraso é calculado pelo prazo e status, não manualmente", async () => {
      const id = await as(c, s.users.supA, async () =>
        (await sql<{ id: string }>(c, "insert into actions (program_id, title, due_date) values ($1, 'Vencida', current_date - 3) returning id", [s.programs.P1]))[0].id,
      );
      const [v] = await as(c, s.users.supA, () => sql<{ is_overdue: boolean }>(c, "select is_overdue from actions_view where id = $1", [id]));
      expect(v.is_overdue).toBe(true);
      await as(c, s.users.supA, () => sql(c, "select set_action_status($1, 'concluida', 'ok')", [id]));
      const [v2] = await as(c, s.users.supA, () => sql<{ is_overdue: boolean }>(c, "select is_overdue from actions_view where id = $1", [id]));
      expect(v2.is_overdue).toBe(false);
    });

    it("histórico não pode ser forjado pelo cliente", async () => {
      const e = await expectError(
        as(c, s.users.supA, () =>
          sql(c, "insert into action_history (action_id, program_id, kind, to_status, actor) values ($1, $2, 'status', 'concluida', $3)", [s.actions.aP1General, s.programs.P1, s.users.supA]),
        ),
      );
      expect(e).toMatch(/row-level/);
      await as(c, s.users.supA, () =>
        sql(c, "insert into action_history (action_id, program_id, kind, note, actor) values ($1, $2, 'comentario', 'ok', $3)", [s.actions.aP1General, s.programs.P1, s.users.supA]),
      );
    });
  });

  describe("Checklists", () => {
    let tpl: string;
    let items: string[];

    it("supervisão cria rascunho, publica e itens ficam imutáveis", async () => {
      tpl = await as(c, s.users.supA, async () =>
        (await sql<{ id: string }>(c, "insert into checklist_templates (program_id, name, cadence, scope) values ($1, 'Rotina semanal', 'semanal', 'equipe') returning id", [s.programs.P1]))[0].id,
      );
      const e0 = await expectError(as(c, s.users.supA, () => sql(c, "select publish_checklist_template($1)", [tpl])));
      expect(e0).toMatch(/ao menos um item/);
      items = await as(c, s.users.supA, async () => {
        const a = await sql<{ id: string }>(c, "insert into checklist_items (template_id, program_id, position, label, required, requires_evidence) values ($1, $2, 0, 'Plano semanal revisado', true, false) returning id", [tpl, s.programs.P1]);
        const b = await sql<{ id: string }>(c, "insert into checklist_items (template_id, program_id, position, label, required, requires_evidence) values ($1, $2, 1, 'Registro fotográfico do posto', true, true) returning id", [tpl, s.programs.P1]);
        const d = await sql<{ id: string }>(c, "insert into checklist_items (template_id, program_id, position, label, required) values ($1, $2, 2, 'Opcional', false) returning id", [tpl, s.programs.P1]);
        return [a[0].id, b[0].id, d[0].id];
      });
      await as(c, s.users.supA, () => sql(c, "select publish_checklist_template($1)", [tpl]));
      const e = await expectError(as(c, s.users.supA, () => sql(c, "update checklist_items set label = 'mudou' where id = $1", [items[0]])));
      expect(e).toMatch(/rascunho/);
      const e2 = await expectError(as(c, s.users.supA, () => sql(c, "update checklist_templates set name = 'mudou' where id = $1", [tpl])));
      expect(e2).toMatch(/imutável/);
    });

    it("nova versão copia itens e, ao publicar, substitui a anterior", async () => {
      const [v2] = await as(c, s.users.supA, () => sql<{ id: string; version: number }>(c, "select * from new_checklist_version($1)", [tpl]));
      expect(v2.version).toBe(2);
      const [{ n }] = await as(c, s.users.supA, () => sql<{ n: number }>(c, "select count(*)::int n from checklist_items where template_id = $1", [v2.id]));
      expect(n).toBe(3);
      await as(c, s.users.supA, () => sql(c, "select publish_checklist_template($1)", [v2.id]));
      const [{ status }] = await sql<{ status: string }>(c, "select status from checklist_templates where id = $1", [tpl]);
      expect(status).toBe("substituido");
      // runs continuam vinculados à versão 1 (histórico preservado); novas aplicações usam a v2
      tpl = v2.id;
      items = (await sql<{ id: string }>(c, "select id from checklist_items where template_id = $1 order by position", [tpl])).map((r) => r.id);
    });

    it("orientador aplica na própria equipe; conclusão valida obrigatórios e evidências", async () => {
      const e = await expectError(
        as(c, s.users.orient1, () => sql(c, "insert into checklist_runs (template_id, program_id, team_id, period_start, period_end) values ($1, $2, $3, '2026-11-23', '2026-11-29')", [tpl, s.programs.P1, s.teams.T2])),
      );
      expect(e).toMatch(/row-level/);
      const run = await as(c, s.users.orient1, async () =>
        (await sql<{ id: string }>(c, "insert into checklist_runs (template_id, program_id, team_id, period_start, period_end) values ($1, $2, $3, '2026-11-23', '2026-11-29') returning id", [tpl, s.programs.P1, s.teams.T1]))[0].id,
      );
      const dup = await expectError(
        as(c, s.users.orient1, () => sql(c, "insert into checklist_runs (template_id, program_id, team_id, period_start, period_end) values ($1, $2, $3, '2026-11-23', '2026-11-29')", [tpl, s.programs.P1, s.teams.T1])),
      );
      expect(dup).toMatch(/period_uk|duplicate/);

      const answer = (item: string, value: string) =>
        as(c, s.users.orient1, async () =>
          (await sql<{ id: string }>(c, "insert into checklist_answers (run_id, template_id, item_id, program_id, value) values ($1, $2, $3, $4, $5) returning id", [run, tpl, item, s.programs.P1, value]))[0].id,
        );
      await answer(items[0], "sim");
      const missing = await expectError(as(c, s.users.orient1, () => sql(c, "select complete_checklist_run($1)", [run])));
      expect(missing).toMatch(/obrigatório/);
      const ansEvid = await answer(items[1], "sim");
      const noEv = await expectError(as(c, s.users.orient1, () => sql(c, "select complete_checklist_run($1)", [run])));
      expect(noEv).toMatch(/evidência/);

      // anexa evidência (documento do mesmo programa)
      const docId = randomUUID();
      const path = `${s.programs.P1}/${randomUUID()}.jpg`;
      await as(c, s.users.orient1, () =>
        sql(c, "insert into documents (id, program_id, team_id, title, original_name, storage_path, mime_type, size_bytes) values ($1, $2, $3, 'Foto posto', 'foto.jpg', $4, 'image/jpeg', 1000)", [docId, s.programs.P1, s.teams.T1, path]),
      );
      await as(c, s.users.orient1, () =>
        sql(c, "insert into checklist_answer_evidences (answer_id, document_id, program_id) values ($1, $2, $3)", [ansEvid, docId, s.programs.P1]),
      );
      const direct = await expectError(as(c, s.users.orient1, () => sql(c, "update checklist_runs set status = 'concluido' where id = $1", [run])));
      expect(direct).toMatch(/conclusão de checklist/);
      await as(c, s.users.orient1, () => sql(c, "select complete_checklist_run($1)", [run]));
      const locked = await expectError(as(c, s.users.orient1, () => sql(c, "update checklist_answers set value = 'nao' where run_id = $1", [run])));
      expect(locked).toMatch(/imutável/);
    });

    it("competidor de outra equipe não vê a aplicação", async () => {
      const rows = await as(c, s.users.comp2, () => sql(c, "select id from checklist_runs"));
      expect(rows).toHaveLength(0);
      const mine = await as(c, s.users.comp1, () => sql(c, "select id from checklist_runs"));
      expect(mine.length).toBe(1);
    });
  });

  describe("Documentos e Storage", () => {
    it("caminho de storage precisa ser do mesmo programa e com nome aleatório", async () => {
      const e = await expectError(
        as(c, s.users.supA, () =>
          sql(c, "insert into documents (program_id, title, original_name, storage_path, mime_type, size_bytes) values ($1, 'x', 'x.pdf', $2, 'application/pdf', 10)", [s.programs.P1, `${s.programs.P2}/${randomUUID()}.pdf`]),
        ),
      );
      expect(e).toMatch(/documents_path_ck/);
      const e2 = await expectError(
        as(c, s.users.supA, () =>
          sql(c, "insert into documents (program_id, title, original_name, storage_path, mime_type, size_bytes) values ($1, 'x', 'x.exe', $2, 'application/x-msdownload', 10)", [s.programs.P1, `${s.programs.P1}/${randomUUID()}.exe`]),
        ),
      );
      expect(e2).toMatch(/mime_type/);
    });

    it("objeto só é baixável por quem lê o documento; confidencial restrito", async () => {
      const path = `${s.programs.P1}/${randomUUID()}.pdf`;
      await as(c, s.users.supA, () =>
        sql(c, "insert into documents (program_id, title, original_name, storage_path, mime_type, size_bytes, classification) values ($1, 'Parecer', 'p.pdf', $2, 'application/pdf', 10, 'confidencial')", [s.programs.P1, path]),
      );
      await as(c, s.users.supA, () => sql(c, "insert into storage.objects (bucket_id, name) values ('documentos', $1)", [path]));
      // upload sem registro prévio é negado
      const orphan = await expectError(
        as(c, s.users.supA, () => sql(c, "insert into storage.objects (bucket_id, name) values ('documentos', $1)", [`${s.programs.P1}/${randomUUID()}.pdf`])),
      );
      expect(orphan).toMatch(/row-level/);

      expect(await as(c, s.users.supA, () => sql(c, "select id from storage.objects where name = $1", [path]))).toHaveLength(1);
      expect(await as(c, s.users.orient1, () => sql(c, "select id from storage.objects where name = $1", [path]))).toHaveLength(0);
      expect(await as(c, s.users.supB, () => sql(c, "select id from storage.objects where name = $1", [path]))).toHaveLength(0);
      expect(await as(c, s.users.gestaoA, () => sql(c, "select id from documents where storage_path = $1", [path]))).toHaveLength(0);
    });

    it("arquivo registrado é imutável e nova versão incrementa", async () => {
      const id = randomUUID();
      await as(c, s.users.supA, () =>
        sql(c, "insert into documents (id, program_id, title, original_name, storage_path, mime_type, size_bytes) values ($1, $2, 'Plano', 'plano.pdf', $3, 'application/pdf', 10)", [id, s.programs.P1, `${s.programs.P1}/${randomUUID()}.pdf`]),
      );
      const e = await expectError(as(c, s.users.supA, () => sql(c, "update documents set size_bytes = 20 where id = $1", [id])));
      expect(e).toMatch(/imutável/);
      const [v2] = await as(c, s.users.supA, () =>
        sql<{ version: number }>(c, "insert into documents (program_id, title, original_name, storage_path, mime_type, size_bytes, supersedes_id, version) values ($1, 'Plano', 'plano-v2.pdf', $2, 'application/pdf', 12, $3, 99) returning version", [s.programs.P1, `${s.programs.P1}/${randomUUID()}.pdf`, id]),
      );
      expect(v2.version).toBe(2);
    });
  });

  describe("Agenda", () => {
    it("recorrência precisa de término e exceções seguem o escopo do evento", async () => {
      const e = await expectError(
        as(c, s.users.supA, () =>
          sql(c, "insert into events (program_id, title, starts_at, ends_at, recurrence_freq) values ($1, 'Treino', '2026-12-01T11:00Z', '2026-12-01T15:00Z', 'semanal')", [s.programs.P1]),
        ),
      );
      expect(e).toMatch(/recurrence_bounded/);
      const ev = await as(c, s.users.supA, async () =>
        (await sql<{ id: string }>(c, "insert into events (program_id, team_id, title, starts_at, ends_at, recurrence_freq, recurrence_weekdays, recurrence_count) values ($1, $2, 'Treino', '2026-12-01T11:00Z', '2026-12-01T15:00Z', 'semanal', '{1,3}', 10) returning id", [s.programs.P1, s.teams.T1]))[0].id,
      );
      await as(c, s.users.orient1, () =>
        sql(c, "insert into event_exceptions (event_id, program_id, occurrence_start, kind) values ($1, $2, '2026-12-03T11:00Z', 'cancelada')", [ev, s.programs.P1]),
      );
      const other = await expectError(
        as(c, s.users.comp1, () =>
          sql(c, "insert into event_exceptions (event_id, program_id, occurrence_start, kind) values ($1, $2, '2026-12-08T11:00Z', 'cancelada')", [ev, s.programs.P1]),
        ),
      );
      expect(other).toMatch(/row-level/);
      expect(await as(c, s.users.comp2, () => sql(c, "select id from events where id = $1", [ev]))).toHaveLength(0);
      expect(await as(c, s.users.comp1, () => sql(c, "select id from event_exceptions where event_id = $1", [ev]))).toHaveLength(1);
    });
  });

  describe("Alertas e auditoria", () => {
    it("alertas são idempotentes e resolvidos quando a condição cessa", async () => {
      const id = await as(c, s.users.supA, async () =>
        (await sql<{ id: string }>(c, "insert into actions (program_id, title, due_date, owner_person_id) values ($1, 'Prazo vencido', current_date - 1, $2) returning id", [s.programs.P1, s.people.pOrient1]))[0].id,
      );
      await sql(c, "set role service_role");
      await sql(c, "select * from refresh_alerts()");
      await sql(c, "select * from refresh_alerts()");
      await sql(c, "reset role");
      const notes = await sql<{ user_id: string }>(c, "select user_id from notifications where entity_id = $1 and resolved_at is null", [id]);
      expect(notes.map((n) => n.user_id).sort()).toEqual([s.users.supA, s.users.orient1].sort());
      // usuário comum não executa a rotina
      const e = await expectError(as(c, s.users.supA, () => sql(c, "select * from refresh_alerts()")));
      expect(e).toMatch(/permission denied/);
      // cada usuário vê só as suas
      expect(await as(c, s.users.supB, () => sql(c, "select id from notifications where entity_id = $1", [id]))).toHaveLength(0);

      await as(c, s.users.supA, () => sql(c, "select set_action_status($1, 'concluida', 'feito')", [id]));
      await sql(c, "select * from refresh_alerts()");
      const open = await sql(c, "select id from notifications where entity_id = $1 and resolved_at is null", [id]);
      expect(open).toHaveLength(0);
    });

    it("auditoria registra ator e mascara campos pessoais", async () => {
      await as(c, s.users.supA, () => sql(c, "update people set full_name = 'Nome Alterado' where id = $1", [s.people.pComp1]));
      const [log] = await sql<{ actor: string; changed: Record<string, unknown> }>(
        c, "select actor, changed from audit_log where table_name = 'people' and record_id = $1 and operation = 'UPDATE' order by id desc limit 1", [s.people.pComp1],
      );
      expect(log.actor).toBe(s.users.supA);
      expect(log.changed.full_name).toBe("«alterado»");
      expect(JSON.stringify(log.changed)).not.toContain("Nome Alterado");
    });

    it("supervisão lê auditoria só do próprio programa", async () => {
      await as(c, s.users.supB, () => sql(c, "update teams set notes = 'x' where id = $1", [s.teams.T3]));
      const mine = await as(c, s.users.supA, () => sql<{ program_id: string }>(c, "select distinct program_id from audit_log where program_id is not null"));
      expect(mine.every((r) => r.program_id === s.programs.P1)).toBe(true);
    });
  });
});
