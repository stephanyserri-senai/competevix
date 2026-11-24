import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";
import { publicEnv } from "@/lib/env";

/**
 * Cliente com a sessão do usuário: TODAS as consultas passam pelo RLS.
 * É o único cliente usado para ler/gravar dados de negócio.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = publicEnv();
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Chamado a partir de Server Component: a renovação de sessão é feita no proxy.
        }
      },
    },
  });
}

export type ServerClient = Awaited<ReturnType<typeof createClient>>;
