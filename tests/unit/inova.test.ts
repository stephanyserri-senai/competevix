import { describe, expect, it } from "vitest";
import { classify, evaluationBreakdown, inovaIndicators, nextStage, panelResult, type Criterion } from "@/features/inova/domain";

const C: Criterion[] = [
  { id: "g", parent_id: null, code: "INOV", name: "Inovação", max_score: 10, position: 0 },
  { id: "i1", parent_id: "g", code: "I1", name: "Originalidade", max_score: 5, position: 0 },
  { id: "i2", parent_id: "g", code: "I2", name: "Impacto", max_score: 5, position: 1 },
  { id: "p", parent_id: null, code: "PITCH", name: "Pitch", max_score: 90, position: 1 },
];
const ev = (id: string, status: "pendente" | "submetida", i1?: number, i2?: number, p?: number) => ({
  assignment_id: id,
  status,
  scores: [
    ...(i1 !== undefined ? [{ criterion_id: "i1", score: i1 }] : []),
    ...(i2 !== undefined ? [{ criterion_id: "i2", score: i2 }] : []),
    ...(p !== undefined ? [{ criterion_id: "p", score: p }] : []),
  ],
});

describe("resultado de banca", () => {
  it("grupo = soma dos critérios; completo só com todas as folhas", () => {
    expect(evaluationBreakdown(C, ev("a", "submetida", 4, 5, 80))).toEqual({ groups: { INOV: 9, PITCH: 80 }, total: 89, complete: true });
    expect(evaluationBreakdown(C, ev("a", "submetida", 4, undefined, 80)).complete).toBe(false);
  });

  it("média só de avaliações submetidas e completas, sem arredondar antes da classificação", () => {
    // 94,5 e 95 → média 94,75: NÃO pode virar 95 (Excelente)
    const r = panelResult(C, [ev("a", "submetida", 5, 4.5, 85), ev("b", "submetida", 5, 5, 85), ev("c", "pendente", 5, 5, 90), ev("d", "submetida", 5)]);
    expect(r.count).toBe(2);
    expect(r.excluded).toBe(2);
    expect(r.total).toBeCloseTo(94.75, 10);
    expect(r.classification).toBe("Muito bom");
    expect(r.groups.INOV).toBeCloseTo(9.75, 10);
  });

  it("faixas do PRD e ausência de avaliação completa", () => {
    expect([95, 94.99, 90, 89.99, 80, 70, 69.99].map((v) => classify(v))).toEqual([
      "Excelente", "Muito bom", "Muito bom", "Intermediário", "Intermediário", "Baixo", "Insuficiente",
    ]);
    expect(panelResult(C, [ev("a", "pendente", 5, 5, 90)])).toMatchObject({ count: 0, total: null, classification: null });
  });
});

describe("funil", () => {
  it("próxima etapa e indicadores", () => {
    expect(nextStage("banca_pitch")).toBe("prioritario");
    expect(nextStage("prioritario")).toBeNull();
    const ind = inovaIndicators([
      { id: "1", stage: "prioritario", evidenceKinds: ["validacao_industrial", "prototipo_funcional"] },
      { id: "2", stage: "prioritario", evidenceKinds: [] },
      { id: "3", stage: "prototipo", evidenceKinds: ["prototipo_funcional"] },
    ]);
    expect(ind).toMatchObject({ priorityCount: 2, priorityValidatedPct: 50, prototypes: 2 });
    expect(ind.funnel.prioritario).toBe(2);
    expect(inovaIndicators([]).priorityValidatedPct).toBeNull();
  });
});
