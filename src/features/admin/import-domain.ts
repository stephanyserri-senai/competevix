/**
 * Importação em massa de usuários (CSV) — regras puras, sem acesso a banco.
 *
 * Cabeçalho (ordem livre; separador ";" ou ","):
 *   email; nome; papel; unidade; competicao; ciclo; inicio; fim
 * - papel: supervisao | orientador | competidor | gestao | avaliador
 * - unidade: código (ex.: BEIRA-MAR) ou nome da unidade
 * - competicao + ciclo (códigos, ex.: WORLDSKILLS + 2027-2028): vínculo com o programa.
 *   Em branco = vínculo com a unidade inteira (só supervisão e gestão).
 * - inicio/fim: AAAA-MM-DD ou DD/MM/AAAA (inicio em branco = hoje; fim opcional)
 * Uma pessoa com vários papéis/programas ocupa várias linhas (mesmo e-mail).
 */
export type ImportRole = "supervisao" | "orientador" | "competidor" | "gestao" | "avaliador";
export const IMPORT_ROLES: ImportRole[] = ["supervisao", "orientador", "competidor", "gestao", "avaliador"];

export const CSV_TEMPLATE =
  "email;nome;papel;unidade;competicao;ciclo;inicio;fim\n" +
  "pessoa@exemplo.invalid;Nome da Pessoa;supervisao;BEIRA-MAR;;;;\n" +
  "outra@exemplo.invalid;Outra Pessoa;orientador;BEIRA-MAR;WORLDSKILLS;2027-2028;;\n";

export type Catalog = {
  units: { id: string; code: string; name: string }[];
  programs: { id: string; unit_id: string; competition_code: string; cycle_code: string }[];
};

export type ParsedRow = {
  line: number;
  email: string;
  name: string;
  role: ImportRole;
  unitId: string;
  programId: string | null;
  validFrom: string;
  validTo: string | null;
};

export type RowIssue = { line: number; email: string; message: string };

const HEADER_ALIASES: Record<string, string> = {
  email: "email", "e-mail": "email",
  nome: "nome", name: "nome",
  papel: "papel", role: "papel", perfil: "papel",
  unidade: "unidade", unit: "unidade",
  competicao: "competicao", "competição": "competicao", competition: "competicao",
  ciclo: "ciclo", cycle: "ciclo",
  inicio: "inicio", "início": "inicio", valid_from: "inicio",
  fim: "fim", valid_to: "fim", termino: "fim", "término": "fim",
};
const ROLE_ALIASES: Record<string, ImportRole> = {
  supervisao: "supervisao", "supervisão": "supervisao",
  orientador: "orientador", orientadora: "orientador",
  competidor: "competidor", competidora: "competidor", aluno: "competidor", aluna: "competidor",
  gestao: "gestao", "gestão": "gestao",
  avaliador: "avaliador", avaliadora: "avaliador",
};

const norm = (s: string) => s.trim().toLowerCase();
const normCode = (s: string) => s.trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Divide uma linha CSV respeitando aspas duplas. */
export function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

export function parseDate(raw: string): string | null | "invalid" {
  const s = raw.trim();
  if (!s) return null;
  let iso = s;
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (br) iso = `${br[3]}-${br[2]}-${br[1]}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "invalid";
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : "invalid";
}

export function parseUsersCsv(text: string, catalog: Catalog, today: string): { rows: ParsedRow[]; issues: RowIssue[] } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const firstIdx = lines.findIndex((l) => l.trim() !== "");
  if (firstIdx < 0) return { rows: [], issues: [{ line: 0, email: "", message: "Arquivo vazio." }] };
  const headerLine = lines[firstIdx];
  const sep = (headerLine.match(/;/g)?.length ?? 0) >= (headerLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const header = splitCsvLine(headerLine, sep).map((h) => HEADER_ALIASES[norm(h)] ?? norm(h));
  const missing = ["email", "nome", "papel", "unidade"].filter((h) => !header.includes(h));
  if (missing.length) {
    return { rows: [], issues: [{ line: firstIdx + 1, email: "", message: `Cabeçalho sem a(s) coluna(s): ${missing.join(", ")}.` }] };
  }

  const rows: ParsedRow[] = [];
  const issues: RowIssue[] = [];
  const seen = new Set<string>();
  if (lines.length - firstIdx - 1 > 1000) {
    return { rows: [], issues: [{ line: 0, email: "", message: "Máximo de 1.000 linhas por importação." }] };
  }

  for (let i = firstIdx + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    const cells = splitCsvLine(raw, sep);
    const get = (k: string) => cells[header.indexOf(k)]?.trim() ?? "";
    const line = i + 1;
    const email = get("email").toLowerCase();
    const fail = (message: string) => issues.push({ line, email, message });

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) { fail("E-mail inválido."); continue; }
    const name = get("nome");
    if (name.length < 2 || name.length > 120) { fail("Nome deve ter entre 2 e 120 caracteres."); continue; }
    const role = ROLE_ALIASES[norm(get("papel"))];
    if (!role) { fail(`Papel inválido. Use: ${IMPORT_ROLES.join(", ")}.`); continue; }

    const unitRaw = get("unidade");
    const unit = catalog.units.find((u) => normCode(u.code) === normCode(unitRaw) || norm(u.name) === norm(unitRaw));
    if (!unit) { fail(`Unidade não encontrada: "${unitRaw}".`); continue; }

    const comp = get("competicao");
    const cyc = get("ciclo");
    let programId: string | null = null;
    if (comp || cyc) {
      if (!comp || !cyc) { fail("Informe competição E ciclo, ou deixe ambos em branco (vínculo por unidade)."); continue; }
      const prog = catalog.programs.find(
        (p) => p.unit_id === unit.id && normCode(p.competition_code) === normCode(comp) && normCode(p.cycle_code) === normCode(cyc),
      );
      if (!prog) { fail(`Programa não encontrado: ${comp} / ${cyc} / ${unit.code}.`); continue; }
      programId = prog.id;
    } else if (role !== "supervisao" && role !== "gestao") {
      fail("Vínculo por unidade inteira só para supervisão e gestão; informe competição e ciclo.");
      continue;
    }

    const from = parseDate(get("inicio"));
    const to = parseDate(get("fim"));
    if (from === "invalid" || to === "invalid") { fail("Data inválida (use AAAA-MM-DD ou DD/MM/AAAA)."); continue; }
    const validFrom = from ?? today;
    if (to && to < validFrom) { fail("Fim anterior ao início."); continue; }

    const key = `${email}|${role}|${programId ?? unit.id}|${validFrom}`;
    if (seen.has(key)) { fail("Linha duplicada (mesmo e-mail, papel, escopo e início)."); continue; }
    seen.add(key);

    rows.push({ line, email, name, role, unitId: unit.id, programId, validFrom, validTo: to });
  }
  if (rows.length === 0 && issues.length === 0) issues.push({ line: 0, email: "", message: "Nenhuma linha de dados encontrada." });
  return { rows, issues };
}

/** Pessoas (cadastro) só são necessárias para quem entra em equipes. */
export function personKindFor(role: ImportRole): "docente" | "aluno" | null {
  if (role === "orientador") return "docente";
  if (role === "competidor") return "aluno";
  return null;
}
