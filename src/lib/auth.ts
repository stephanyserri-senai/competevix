import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/lib/database.types";

export type MembershipRole = Enums<"membership_role">;

export type Access = {
  userId: string;
  displayName: string;
  isAdmin: boolean;
  /** Papéis vigentes por programa, calculados NO BANCO (my_access). Só orienta a UI. */
  roles: Record<string, MembershipRole[]>;
};

/**
 * Sessão e papéis do usuário corrente (memoizado por requisição).
 * A UI usa isto apenas para exibir/ocultar controles; quem decide o acesso é o RLS.
 */
export const getAccess = cache(async (): Promise<Access | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;

  const [{ data: profile }, { data: access }] = await Promise.all([
    supabase.from("profiles").select("display_name, active").eq("id", userId).maybeSingle(),
    supabase.rpc("my_access"),
  ]);
  if (!profile || !profile.active) return null;

  const roles: Record<string, MembershipRole[]> = {};
  let isAdmin = false;
  for (const row of access ?? []) {
    isAdmin = isAdmin || row.is_admin;
    if (row.program_id) roles[row.program_id] = row.roles;
  }
  return { userId, displayName: profile.display_name, isAdmin, roles };
});

export async function requireAccess(): Promise<Access> {
  const access = await getAccess();
  if (!access) redirect("/login?motivo=sessao");
  return access;
}

export function hasRole(access: Access, programId: string | null | undefined, ...roles: MembershipRole[]) {
  if (!programId) return false;
  return (access.roles[programId] ?? []).some((r) => roles.includes(r));
}

export function supervisedPrograms(access: Access) {
  return Object.entries(access.roles)
    .filter(([, r]) => r.includes("supervisao"))
    .map(([id]) => id);
}

export function isSupervisorAnywhere(access: Access) {
  return supervisedPrograms(access).length > 0;
}

export const ROLE_LABEL: Record<MembershipRole, string> = {
  supervisao: "Supervisão",
  orientador: "Orientador(a)",
  competidor: "Competidor(a)",
  gestao: "Gestão",
  avaliador: "Avaliador(a)",
  napi: "NAPI",
};
