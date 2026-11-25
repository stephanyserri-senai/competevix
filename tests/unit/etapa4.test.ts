import { describe, expect, it } from "vitest";
import { summarize } from "@/features/orcamento/domain";
import { riskLevel, riskMatrix } from "@/features/riscos/domain";
import { nextRequestStatuses } from "@/features/recursos/domain";
import { toCsv } from "@/lib/csv";

describe("orçamento — mesma regra da visão do banco", () => {
  it("reconcilia o saldo sem dupla contagem e ignora cancelados", () => {
    const txs = [
      { id: "s", type: "solicitado" as const, amount: 1100, parent_id: null, cancelled_at: null },
      { id: "a", type: "aprovado" as const, amount: 1000, parent_id: null, cancelled_at: null },
      { id: "c", type: "comprometido" as const, amount: 600, parent_id: null, cancelled_at: null },
      { id: "r1", type: "realizado" as const, amount: 400, parent_id: "c", cancelled_at: null },
      { id: "r2", type: "realizado" as const, amount: 100, parent_id: null, cancelled_at: null },
      { id: "x", type: "comprometido" as const, amount: 50, parent_id: null, cancelled_at: "2026-12-02" },
    ];
    expect(summarize(txs)).toEqual({ requested: 1100, approved: 1000, committed: 600, realized: 500, openCommitments: 200, balance: 300 });
  });
  it("centavos sem erro de ponto flutuante", () => {
    const s = summarize([
      { id: "a", type: "aprovado", amount: 0.3, parent_id: null, cancelled_at: null },
      { id: "r", type: "realizado", amount: 0.1, parent_id: null, cancelled_at: null },
      { id: "r2", type: "realizado", amount: 0.2, parent_id: null, cancelled_at: null },
    ]);
    expect(s.balance).toBe(0);
  });
});

describe("riscos e solicitações", () => {
  it("níveis e matriz", () => {
    expect([1, 4, 5, 9, 10, 14, 15, 25].map(riskLevel)).toEqual(["baixo", "baixo", "moderado", "moderado", "alto", "alto", "critico", "critico"]);
    const m = riskMatrix([{ probability: 5, impact: 4, status: "aberto" }, { probability: 5, impact: 4, status: "fechado" }]);
    expect(m[4][3]).toBe(1);
  });
  it("transições espelham o banco", () => {
    expect(nextRequestStatuses("rascunho", false)).toEqual(["enviada", "cancelada"]);
    expect(nextRequestStatuses("enviada", false)).toEqual(["cancelada"]);
    expect(nextRequestStatuses("enviada", true)).toEqual(["em_analise", "aprovada", "rejeitada", "cancelada"]);
    expect(nextRequestStatuses("atendida", true)).toEqual([]);
  });
  it("CSV pt-BR", () => {
    expect(toCsv([["a", 1.5, null, "x;y"]])).toBe('﻿a;1,5;;"x;y"\r\n');
  });
});
