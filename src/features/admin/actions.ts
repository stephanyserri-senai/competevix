"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dbFailure, invalid, parseForm, success, type FormState } from "@/lib/forms";
import { inviteSchema, membershipSchema } from "@/features/schemas";

/** Confirma no BANCO (não na interface) que o usuário corrente é administrador. */
async function assertAdmin() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_access");
  if (!data?.some((r) => r.is_admin)) throw new Error("Acesso restrito a administradores.");
  return supabase;
}

/** Convite (sem cadastro público). Requer SUPABASE_SECRET_KEY no servidor. */
export async function inviteUser(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(inviteSchema, fd);
  if (!p.success) return invalid(p.error);
  try {
    await assertAdmin();
  } catch {
    return { ok: false, message: "Acesso restrito a administradores.", at: Date.now() };
  }
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, message: "Convites indisponíveis: SUPABASE_SECRET_KEY não configurada no servidor.", at: Date.now() };
  }
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error } = await admin.auth.admin.inviteUserByEmail(p.data.email, {
    data: { display_name: p.data.display_name },
    redirectTo: `${site}/auth/confirm?next=/auth/definir-senha`,
  });
  if (error) {
    return { ok: false, message: /already|registered|exists/i.test(error.message) ? "Já existe um usuário com este e-mail." : "Não foi possível enviar o convite.", at: Date.now() };
  }
  revalidatePath("/configuracoes");
  return success("Convite enviado. Defina os vínculos de acesso do usuário abaixo.");
}

/** Ativa/desativa: o RLS deixa de conceder acesso imediatamente; o login também é bloqueado. */
export async function setUserActive(userId: string, active: boolean): Promise<FormState> {
  if (!z.uuid().safeParse(userId).success) return { ok: false, message: "Usuário inválido.", at: Date.now() };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ active }).eq("id", userId).select("id").single();
  if (error) return dbFailure(error);
  try {
    await createAdminClient().auth.admin.updateUserById(userId, { ban_duration: active ? "none" : "876000h" });
  } catch {
    /* sem chave secreta: o RLS já bloqueia o acesso a dados */
  }
  revalidatePath("/configuracoes");
  return success(active ? "Usuário reativado." : "Usuário desativado; acesso revogado imediatamente.");
}

export async function addMembership(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(membershipSchema, fd);
  if (!p.success) return invalid(p.error);
  const d = p.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("memberships")
    .insert({
      user_id: d.user_id,
      program_id: d.scope === "programa" ? d.program_id : null,
      unit_id: d.scope === "unidade" ? d.unit_id : null,
      role: d.role,
      valid_from: d.valid_from,
      valid_to: d.valid_to,
      note: d.note,
    })
    .select("id")
    .single();
  if (error) return dbFailure(error);
  revalidatePath("/configuracoes");
  return success("Vínculo de acesso criado.");
}

export async function revokeMembership(id: string): Promise<FormState> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const { error } = await supabase
    .from("memberships")
    .update({ revoked_at: new Date().toISOString(), revoked_by: claims?.claims?.sub })
    .eq("id", id)
    .select("id")
    .single();
  if (error) return dbFailure(error);
  revalidatePath("/configuracoes");
  return success("Vínculo revogado com efeito imediato.");
}

const linkSchema = z.object({ person_id: z.uuid(), email: z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.union([z.literal(""), z.email({ message: "E-mail inválido." })])) });

export async function linkPersonToUser(_: FormState, fd: FormData): Promise<FormState> {
  const p = parseForm(linkSchema, fd);
  if (!p.success) return invalid(p.error);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("link_person_to_user", { p_person: p.data.person_id, p_email: p.data.email });
  if (error) return dbFailure(error);
  revalidatePath("/equipes/pessoas");
  return success(data ?? "Atualizado.");
}
