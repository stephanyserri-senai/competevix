import { describe, expect, it } from "vitest";
import { completionBlockers, dueLabel, isOverdue, isTransitionAllowed, wouldCreateCycle } from "@/features/acoes/domain";
import { completionIssues, periodFor } from "@/features/checklists/domain";
import { formatPercent, ratio, scoreDeviation } from "@/features/dashboard/domain";
import { BACKLOG_REUNIAO_2026_11_24 } from "@/features/acoes/backlog-reuniao";

describe("ações", () => {
  it("matriz de transições", () => {
    expect(isTransitionAllowed("aberta", "concluida")).toBe(true);
    expect(isTransitionAllowed("bloqueada", "concluida")).toBe(false);
    expect(isTransitionAllowed("cancelada", "em_andamento")).toBe(false);
    expect(isTransitionAllowed("concluida", "aberta")).toBe(true);
  });
  it("atraso derivado de prazo e status", () => {
    expect(isOverdue({ due_date: "2026-11-20", status: "aberta" }, "2026-11-24")).toBe(true);
    expect(isOverdue({ due_date: "2026-11-20", status: "concluida" }, "2026-11-24")).toBe(false);
    expect(isOverdue({ due_date: null, status: "aberta" }, "2026-11-24")).toBe(false);
    expect(dueLabel({ due_date: "2026-11-23", status: "aberta" }, "2026-11-24")).toBe("Vencida há 1 dia");
  });
  it("exigências de conclusão", () => {
    expect(completionBlockers({ rule: "nota_ou_evidencia", requiresEvidence: false, evidenceCount: 0, note: " ", openDependencies: 0 })).toHaveLength(1);
    expect(completionBlockers({ rule: "nota_ou_evidencia", requiresEvidence: false, evidenceCount: 0, note: "ok", openDependencies: 0 })).toHaveLength(0);
    expect(completionBlockers({ rule: "nada", requiresEvidence: true, evidenceCount: 0, note: "ok", openDependencies: 2 })).toHaveLength(2);
  });
  it("detecção de ciclo de dependências", () => {
    const edges = [{ action_id: "b", depends_on_id: "a" }, { action_id: "c", depends_on_id: "b" }];
    expect(wouldCreateCycle(edges, "a", "c")).toBe(true);
    expect(wouldCreateCycle(edges, "c", "a")).toBe(false);
    expect(wouldCreateCycle(edges, "a", "a")).toBe(true);
  });
});

describe("checklists", () => {
  it("períodos por cadência", () => {
    expect(periodFor("semanal", "2026-11-26")).toEqual({ start: "2026-11-23", end: "2026-11-29" });
    expect(periodFor("mensal", "2027-02-10")).toEqual({ start: "2027-02-01", end: "2027-02-28" });
  });
  it("pendências de conclusão", () => {
    const items = [
      { id: "1", required: true, requires_evidence: false },
      { id: "2", required: true, requires_evidence: true },
      { id: "3", required: false, requires_evidence: false },
    ];
    expect(completionIssues(items, [{ item_id: "1", value: "sim", evidence_count: 0 }])).toEqual(["Faltam 1 item(ns) obrigatório(s)."]);
    expect(completionIssues(items, [{ item_id: "1", value: "sim", evidence_count: 0 }, { item_id: "2", value: "sim", evidence_count: 0 }])).toHaveLength(1);
    expect(completionIssues(items, [{ item_id: "1", value: "nao", evidence_count: 0 }, { item_id: "2", value: "na", evidence_count: 0 }])).toHaveLength(0);
  });
});

describe("indicadores", () => {
  it("denominador zero = N/A, não zero", () => {
    expect(ratio(0, 0, "x").value).toBeNull();
    expect(formatPercent(ratio(0, 0, "x").value)).toBe("N/A");
    expect(formatPercent(ratio(3, 4, "x").value)).toBe("75%");
    expect(scoreDeviation(null, 760)).toBeNull();
    expect(scoreDeviation(742, 750)).toBe(-8);
  });
});

describe("backlog da reunião 24/11/2026", () => {
  it("sem responsáveis e sem prazos, exceto a janela informada", () => {
    const all = Object.values(BACKLOG_REUNIAO_2026_11_24).flatMap((g) => g.items);
    expect(all.length).toBeGreaterThan(15);
    expect(new Set(all.map((i) => i.key)).size).toBe(all.length);
    const dated = all.filter((i) => i.start_date || i.due_date);
    expect(dated).toHaveLength(1);
    expect(dated[0]).toMatchObject({ start_date: "2026-11-30", due_date: "2026-12-04" });
  });
});
