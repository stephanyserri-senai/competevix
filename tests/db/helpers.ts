/**
 * Utilitários para testar RLS num PostgreSQL com os shims do Supabase.
 * Cada `as()` abre uma transação com `role authenticated` e o claim `sub`,
 * exatamente como o PostgREST faz no Supabase; `asAnon()` simula visitante.
 */
import { Client } from "pg";
import { randomUUID } from "node:crypto";

export const TEST_DB_URL = process.env.TEST_DATABASE_URL;
export const hasDb = Boolean(TEST_DB_URL);

export async function connect(): Promise<Client> {
  const client = new Client({ connectionString: TEST_DB_URL });
  await client.connect();
  return client;
}

/** Executa como superusuário (fixtures). */
export async function sql<T = Record<string, unknown>>(c: Client, text: string, params: unknown[] = []): Promise<T[]> {
  const r = await c.query(text, params);
  return r.rows as T[];
}

async function inRole<T>(c: Client, role: "authenticated" | "anon", sub: string | null, fn: () => Promise<T>): Promise<T> {
  await c.query("begin");
  try {
    await c.query(`set local role ${role}`);
    await c.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(sub ? { sub, role } : { role }),
    ]);
    const out = await fn();
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback");
    throw e;
  }
}

export function as<T>(c: Client, userId: string, fn: () => Promise<T>) {
  return inRole(c, "authenticated", userId, fn);
}
export function asAnon<T>(c: Client, fn: () => Promise<T>) {
  return inRole(c, "anon", null, fn);
}

/** Cria usuário em auth.users (o trigger cria o perfil). */
export async function createUser(c: Client, label: string): Promise<string> {
  const id = randomUUID();
  await c.query(
    "insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)",
    [id, `${label}-${id.slice(0, 8)}@teste.invalid`, JSON.stringify({ display_name: `Teste ${label}` })],
  );
  return id;
}

export async function grant(
  c: Client,
  userId: string,
  role: string,
  scope: { programId?: string; unitId?: string },
  opts: { validFrom?: string; validTo?: string } = {},
) {
  const [row] = await sql<{ id: string }>(
    c,
    `insert into public.memberships (user_id, program_id, unit_id, role, valid_from, valid_to)
     values ($1, $2, $3, $4, coalesce($5::date, (now() at time zone 'America/Sao_Paulo')::date), $6::date) returning id`,
    [userId, scope.programId ?? null, scope.unitId ?? null, role, opts.validFrom ?? null, opts.validTo ?? null],
  );
  return row.id;
}

/** Espera que a promessa falhe (RLS/trigger); retorna a mensagem. */
export async function expectError(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error("Era esperado erro, mas a operação foi aceita.");
}

export const uid = () => randomUUID();
