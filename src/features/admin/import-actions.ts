"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { translateDbError } from "@/lib/errors";
import { todayLocal } from "@/lib/dates";
import { listPrograms } from "@/features/programas/queries";
import { parseUsersCsv, personKindFor, type RowIssue } from "./import-domain";

export type ImportResultRow = { line: number; email: string; status: "ok" | "aviso" | "erro"; message: string; link?: string };
export type ImportState = {
  ok: boolean;
  mode: "validar" | "importar";
  message: string;
  issues: RowIssue[];
  preview?: { line: number; email: string; name: string; role: string; scope: string; validFrom: string; validTo: string | null }[];
  results?: ImportResultRow[];
  at: number;
} | null;

const inputSchema = z.object({
  csv: z.string().max(500_000, "Arquivo muito grande (máx. 500 KB)."),
  mode: z.enum(["validar", "importar"]),
  metodo: z.enum(["link", "email"]),
});

/**
 * Importa usuários em massa. Etapas: valida o CSV inteiro; só importa se não houver erros.
 * Para cada e-mail novo cria o usuário (link de primeiro acesso OU convite por e-mail),
 * cria os vínculos (sessão do administrador, sujeito ao RLS e auditado) e, para orientadores
 * e competidores, o cadastro mínimo de pessoa vinculado ao login (necessário para equipes).
 */
export async function importUsers(_: ImportState, fd: FormData): Promise<ImportState> {
  const parsedInput = inputSchema.safeParse({ csv: fd.get("csv") ?? "", mode: fd.get("mode"), metodo: fd.get("metodo") ?? "link" });
  if (!parsedInput.success) {
    return { ok: false, mode: "validar", message: parsedInput.error.issues[0]?.message ?? "Dados inválidos.", issues: [], at: Date.now() };
  }
  const { csv, mode, metodo } = parsedInput.data;
  const supabase = await createClient();

  const { data: access } = await supabase.rpc("my_access");
  if (!access?.some((r) => r.is_admin)) {
    return { ok: false, mode, message: "Acesso restrito a administradores.", issues: [], at: Date.now() };
  }

  const [{ data: units }, programs] = await Promise.all([
    supabase.from("units").select("id, code, name").is("archived_at", null),
    listPrograms(supabase),
  ]);
  const catalog = {
    units: units ?? [],
    programs: programs.map((p) => ({ id: p.id, unit_id: p.unit_id, competition_code: p.competition?.code ?? "", cycle_code: p.cycle?.code ?? "" })),
  };
  const unitName = new Map((units ?? []).map((u) => [u.id, u.code]));
  const progName = new Map(programs.map((p) => [p.id, `${p.competition?.code} ${p.cycle?.code} ${p.unit?.code}`]));
  const { rows, issues } = parseUsersCsv(csv, catalog, todayLocal());
  const preview = rows.map((r) => ({
    line: r.line, email: r.email, name: r.name, role: r.role,
    scope: r.programId ? `Programa ${progName.get(r.programId)}` : `Unidade ${unitName.get(r.unitId)}`,
    validFrom: r.validFrom, validTo: r.validTo,
  }));

  if (mode === "validar" || issues.length) {
    return {
      ok: issues.length === 0,
      mode: "validar",
      message: issues.length
        ? `${issues.length} linha(s) com problema. Corrija e valide novamente; nada foi importado.`
        : `${rows.length} linha(s) válida(s), ${new Set(rows.map((r) => r.email)).size} pessoa(s). Confira e clique em Importar.`,
      issues,
      preview,
      at: Date.now(),
    };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, mode, message: "SUPABASE_SECRET_KEY não configurada no servidor (Vercel).", issues: [], at: Date.now() };
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { data: existingUsers } = await supabase.rpc("admin_list_users");
  const userByEmail = new Map((existingUsers ?? []).map((u) => [u.email.toLowerCase(), u.id]));
  const results: ImportResultRow[] = [];
  const created = new Map<string, { id: string; link?: string }>();

  for (const r of rows) {
    // 1. Usuário
    let userId = userByEmail.get(r.email) ?? created.get(r.email)?.id;
    let link: string | undefined;
    let userNote = "usuário já existente";
    if (!userId) {
      if (metodo === "link") {
        const { data, error } = await admin.auth.admin.generateLink({
          type: "invite",
          email: r.email,
          options: { data: { display_name: r.name }, redirectTo: `${site}/auth/confirm` },
        });
        if (error || !data.user) {
          results.push({ line: r.line, email: r.email, status: "erro", message: "Não foi possível criar o usuário." });
          continue;
        }
        userId = data.user.id;
        link = `${site}/auth/confirm?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=invite&next=/auth/definir-senha`;
      } else {
        const { data, error } = await admin.auth.admin.inviteUserByEmail(r.email, {
          data: { display_name: r.name },
          redirectTo: `${site}/auth/confirm?next=/auth/definir-senha`,
        });
        if (error || !data.user) {
          results.push({ line: r.line, email: r.email, status: "erro", message: /rate/i.test(error?.message ?? "") ? "Limite de envio de e-mails atingido; use a opção de links." : "Não foi possível enviar o convite." });
          continue;
        }
        userId = data.user.id;
      }
      created.set(r.email, { id: userId, link });
      userNote = metodo === "link" ? "usuário criado (link gerado)" : "usuário criado (convite enviado)";
    } else if (created.has(r.email)) {
      userNote = "usuário criado nesta importação";
    }

    // 2. Vínculo de acesso (sessão do administrador → RLS + auditoria)
    const { error: mErr } = await supabase
      .from("memberships")
      .insert({
        user_id: userId,
        program_id: r.programId,
        unit_id: r.programId ? null : r.unitId,
        role: r.role,
        valid_from: r.validFrom,
        valid_to: r.validTo,
        note: "Importação em massa",
      })
      .select("id")
      .single();
    let membershipNote = "vínculo criado";
    let status: ImportResultRow["status"] = "ok";
    if (mErr) {
      if (mErr.code === "23505") {
        membershipNote = "vínculo já existia";
        status = "aviso";
      } else {
        results.push({ line: r.line, email: r.email, status: "erro", message: `${userNote}; vínculo: ${translateDbError(mErr)}`, link });
        continue;
      }
    }

    // 3. Cadastro de pessoa (orientador/competidor), vinculado ao login
    let personNote = "";
    const kind = personKindFor(r.role);
    if (kind) {
      const { data: person } = await admin.from("people").select("id").eq("user_id", userId).maybeSingle();
      if (!person) {
        const { error: pErr } = await admin
          .from("people")
          .insert({ unit_id: r.unitId, full_name: r.name, kind, user_id: userId, email: r.email });
        personNote = pErr ? "; pessoa: não criada (cadastre em Equipes → Pessoas)" : "; pessoa cadastrada";
        if (pErr) status = "aviso";
      }
    }
    results.push({ line: r.line, email: r.email, status, message: `${userNote}; ${membershipNote}${personNote}`, link });
  }

  revalidatePath("/configuracoes");
  const errors = results.filter((x) => x.status === "erro").length;
  return {
    ok: errors === 0,
    mode,
    message: `Importação concluída: ${results.length - errors} linha(s) processada(s), ${errors} com erro, ${created.size} usuário(s) novo(s).`,
    issues: [],
    results,
    at: Date.now(),
  };
}
