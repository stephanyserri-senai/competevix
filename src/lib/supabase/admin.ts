import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Cliente com chave secreta (ignora RLS). Uso RESTRITO a:
 *  - convites/desativação de usuários no Auth, após verificar `is_admin` com a sessão do usuário;
 *  - rotina agendada de alertas (`refresh_alerts`).
 * Nunca use para ler dados de negócio em páginas.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) {
    throw new Error("SUPABASE_SECRET_KEY não configurada no servidor.");
  }
  return createClient<Database>(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
