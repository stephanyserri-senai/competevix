import { describe, expect, it } from "vitest";
import { parseUsersCsv, splitCsvLine, parseDate } from "@/features/admin/import-domain";
import { toCsv } from "@/lib/csv";

const catalog = {
  units: [
    { id: "u1", code: "BEIRA-MAR", name: "SENAI Vitória — Beira-Mar" },
    { id: "u2", code: "PORTO", name: "SENAI Vitória — Porto" },
  ],
  programs: [
    { id: "p1", unit_id: "u1", competition_code: "WORLDSKILLS", cycle_code: "2027-2028" },
    { id: "p2", unit_id: "u2", competition_code: "WORLDSKILLS", cycle_code: "2027-2028" },
  ],
};

describe("importação de usuários (CSV)", () => {
  it("aceita ; ou , , aliases de cabeçalho/papel e datas BR", () => {
    const csv = "E-mail,Nome,Perfil,Unidade,Competição,Ciclo,Início,Fim\nA@X.invalid,Ana Souza,Supervisão,beira-mar,,,,\nb@x.invalid,Bruno,orientadora,PORTO,worldskills,2027-2028,01/12/2026,31/12/2027\n";
    const { rows, issues } = parseUsersCsv(csv, catalog, "2026-11-25");
    expect(issues).toEqual([]);
    expect(rows[0]).toMatchObject({ email: "a@x.invalid", role: "supervisao", unitId: "u1", programId: null, validFrom: "2026-11-25" });
    expect(rows[1]).toMatchObject({ role: "orientador", programId: "p2", validFrom: "2026-12-01", validTo: "2027-12-31" });
  });

  it("rejeita linhas inválidas com motivo e linha", () => {
    const csv = [
      "email;nome;papel;unidade;competicao;ciclo;inicio;fim",
      "sem-arroba;Fulano;supervisao;PORTO;;;;",
      "c@x.invalid;Ci;competidor;PORTO;;;;",
      "d@x.invalid;Dani;chefe;PORTO;;;;",
      "e@x.invalid;Edu;orientador;LUA;WORLDSKILLS;2027-2028;;",
      "f@x.invalid;Fê;orientador;PORTO;INOVA;2027-2028;;",
      "g@x.invalid;Gil;gestao;PORTO;;;2027-02-30;",
      "h@x.invalid;Hugo;gestao;PORTO;;;2027-02-01;2027-01-01",
      "i@x.invalid;Iara;supervisao;PORTO;;;;",
      "i@x.invalid;Iara;supervisao;PORTO;;;;",
    ].join("\n");
    const { rows, issues } = parseUsersCsv(csv, catalog, "2026-11-25");
    expect(rows).toHaveLength(1);
    expect(issues.map((i) => i.line)).toEqual([2, 3, 4, 5, 6, 7, 8, 10]);
    expect(issues[1].message).toMatch(/unidade inteira/);
    expect(issues[4].message).toMatch(/Programa não encontrado/);
    expect(issues[7].message).toMatch(/duplicada/);
  });

  it("cabeçalho incompleto e utilitários", () => {
    expect(parseUsersCsv("email;nome\nx@y.z;Xi", catalog, "2026-11-25").issues[0].message).toMatch(/papel, unidade/);
    expect(splitCsvLine('a;"b;c";"d ""e"""', ";")).toEqual(["a", "b;c", 'd "e"']);
    expect(parseDate("")).toBeNull();
    expect(parseDate("31/02/2027")).toBe("invalid");
    expect(toCsv([["a", "b;c"]])).toBe('﻿a;"b;c"\r\n');
  });
});
