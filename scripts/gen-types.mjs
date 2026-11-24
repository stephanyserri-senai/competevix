#!/usr/bin/env node
/**
 * Gera src/lib/database.types.ts a partir do catálogo do PostgreSQL, no mesmo formato
 * de `supabase gen types typescript`. Usado quando o CLI do Supabase (que depende de
 * Docker) não está disponível. Com o Supabase CLI, prefira:
 *   npx supabase gen types typescript --local > src/lib/database.types.ts
 *
 * Uso: TEST_DATABASE_URL=postgres://... node scripts/gen-types.mjs
 */
import pg from "pg";
import { writeFileSync } from "node:fs";

const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("Defina TEST_DATABASE_URL (banco com as migrations aplicadas).");
  process.exit(1);
}
const client = new pg.Client({ connectionString: url });
await client.connect();
const q = async (text, params = []) => (await client.query(text, params)).rows;

const enums = await q(`
  select t.typname as name, array_agg(e.enumlabel order by e.enumsortorder)::text[] as labels
  from pg_type t join pg_enum e on e.enumtypid = t.oid join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public' group by t.typname order by t.typname`);
const enumNames = new Set(enums.map((e) => e.name));

const columns = await q(`
  select c.relname as table, c.relkind as kind, a.attname as column, a.attnum,
         format_type(a.atttypid, a.atttypmod) as type, t.typname, t.typcategory,
         et.typname as elem_typname, et.typcategory as elem_category,
         not a.attnotnull as nullable,
         (a.atthasdef or a.attidentity <> '' or a.attgenerated <> '') as has_default
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_type t on t.oid = a.atttypid
  left join pg_type et on et.oid = t.typelem and t.typcategory = 'A'
  where n.nspname = 'public' and c.relkind in ('r', 'v') and a.attnum > 0 and not a.attisdropped
  order by c.relname, a.attnum`);

const fks = await q(`
  select con.conname as name, src.relname as table, tgt.relname as target,
         array(select attname from unnest(con.conkey) with ordinality k(n, o) join pg_attribute on attrelid = con.conrelid and attnum = k.n order by o)::text[] as cols,
         array(select attname from unnest(con.confkey) with ordinality k(n, o) join pg_attribute on attrelid = con.confrelid and attnum = k.n order by o)::text[] as ref_cols
  from pg_constraint con
  join pg_class src on src.oid = con.conrelid join pg_namespace sn on sn.oid = src.relnamespace
  join pg_class tgt on tgt.oid = con.confrelid join pg_namespace tn on tn.oid = tgt.relnamespace
  where con.contype = 'f' and sn.nspname = 'public' and tn.nspname = 'public'
  order by src.relname, con.conname`);

const uniques = await q(`
  select src.relname as table,
         array(select attname from unnest(con.conkey) k(n) join pg_attribute on attrelid = con.conrelid and attnum = k.n order by 1)::text[] as cols
  from pg_constraint con join pg_class src on src.oid = con.conrelid join pg_namespace sn on sn.oid = src.relnamespace
  where con.contype in ('u', 'p') and sn.nspname = 'public'`);

const functions = await q(`
  select p.proname as name,
         coalesce(p.proargnames, '{}')::text[] as arg_names,
         coalesce(p.proargmodes::text[], '{}') as arg_modes,
         array(select format_type(x, null) from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) with ordinality u(x, o) order by o)::text[] as arg_types,
         array(select t.typname from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) with ordinality u(x, o) join pg_type t on t.oid = u.x order by u.o)::text[] as arg_typnames,
         p.pronargdefaults as n_defaults, p.pronargs as n_args,
         p.proretset as returns_set, rt.typname as ret_typname, rt.typtype as ret_typtype, rc.relname as ret_relname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_type rt on rt.oid = p.prorettype
  left join pg_class rc on rc.oid = rt.typrelid and rc.relkind in ('r', 'v')
  where n.nspname = 'public' and p.prokind = 'f'
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    and rt.typname <> 'trigger'
  order by p.proname`);
await client.end();

function scalar(typname, category) {
  if (enumNames.has(typname)) return `Database["public"]["Enums"]["${typname}"]`;
  if (["int2", "int4", "int8", "float4", "float8", "numeric", "oid"].includes(typname)) return "number";
  if (typname === "bool") return "boolean";
  if (["json", "jsonb"].includes(typname)) return "Json";
  if (category === "S" || ["uuid", "date", "timestamptz", "timestamp", "time", "interval", "text", "varchar", "bpchar", "citext", "inet"].includes(typname)) return "string";
  return "unknown";
}
function tsType(col) {
  if (col.typcategory === "A") return `${scalar(col.elem_typname, col.elem_category)}[]`;
  return scalar(col.typname, col.typcategory);
}
function argTs(typname) {
  if (typname.startsWith("_")) return `${scalar(typname.slice(1))}[]`;
  return scalar(typname);
}

const tables = {};
for (const c of columns) {
  (tables[c.table] ??= { kind: c.kind, cols: [] }).cols.push(c);
}
const ind = (n) => "  ".repeat(n);
const key = (k) => (/^[a-z_][a-z0-9_]*$/.test(k) ? k : JSON.stringify(k));

let out = `// ARQUIVO GERADO — não editar à mão. Fonte: supabase/migrations. Regerar: npm run db:types
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
`;
const views = [];
for (const [name, t] of Object.entries(tables)) {
  if (t.kind === "v") { views.push([name, t]); continue; }
  const rels = fks.filter((f) => f.table === name);
  const isOneToOne = (cols) => uniques.some((u) => u.table === name && [...u.cols].sort().join() === [...cols].sort().join());
  out += `${ind(3)}${key(name)}: {\n${ind(4)}Row: {\n`;
  for (const c of t.cols) out += `${ind(5)}${key(c.column)}: ${tsType(c)}${c.nullable ? " | null" : ""};\n`;
  out += `${ind(4)}};\n${ind(4)}Insert: {\n`;
  for (const c of t.cols) out += `${ind(5)}${key(c.column)}${c.nullable || c.has_default ? "?" : ""}: ${tsType(c)}${c.nullable ? " | null" : ""};\n`;
  out += `${ind(4)}};\n${ind(4)}Update: {\n`;
  for (const c of t.cols) out += `${ind(5)}${key(c.column)}?: ${tsType(c)}${c.nullable ? " | null" : ""};\n`;
  out += `${ind(4)}};\n${ind(4)}Relationships: [\n`;
  for (const f of rels) {
    out += `${ind(5)}{\n${ind(6)}foreignKeyName: "${f.name}";\n${ind(6)}columns: [${f.cols.map((c) => `"${c}"`).join(", ")}];\n${ind(6)}isOneToOne: ${isOneToOne(f.cols)};\n${ind(6)}referencedRelation: "${f.target}";\n${ind(6)}referencedColumns: [${f.ref_cols.map((c) => `"${c}"`).join(", ")}];\n${ind(5)}},\n`;
  }
  out += `${ind(4)}];\n${ind(3)}};\n`;
}
out += `${ind(2)}};\n${ind(2)}Views: {\n`;
for (const [name, t] of views) {
  out += `${ind(3)}${key(name)}: {\n${ind(4)}Row: {\n`;
  for (const c of t.cols) out += `${ind(5)}${key(c.column)}: ${tsType(c)} | null;\n`;
  out += `${ind(4)}};\n${ind(4)}Relationships: [];\n${ind(3)}};\n`;
}
out += `${ind(2)}};\n${ind(2)}Functions: {\n`;
for (const f of functions) {
  const args = [];
  const outs = [];
  const firstDefault = f.n_args - f.n_defaults;
  let inIdx = 0;
  f.arg_names.forEach((n, i) => {
    const mode = f.arg_modes[i] ?? "i";
    if (mode === "o" || mode === "t") outs.push([n, argTs(f.arg_typnames[i])]);
    else { args.push([n, argTs(f.arg_typnames[i]), inIdx >= firstDefault]); inIdx++; }
  });
  let ret;
  if (outs.length) ret = `{ ${outs.map(([n, t]) => `${key(n)}: ${t}`).join("; ")} }[]`;
  else if (f.ret_relname) ret = `Database["public"]["Tables"]["${f.ret_relname}"]["Row"]${f.returns_set ? "[]" : ""}`;
  else if (f.ret_typname === "void") ret = "undefined";
  else ret = `${argTs(f.ret_typname)}${f.returns_set ? "[]" : ""}`;
  const argsTs = args.length ? `{ ${args.map(([n, t, opt]) => `${key(n)}${opt ? "?" : ""}: ${t}`).join("; ")} }` : "never";
  out += `${ind(3)}${key(f.name)}: {\n${ind(4)}Args: ${argsTs};\n${ind(4)}Returns: ${ret};\n${ind(3)}};\n`;
}
out += `${ind(2)}};\n${ind(2)}Enums: {\n`;
for (const e of enums) out += `${ind(3)}${key(e.name)}: ${e.labels.map((l) => JSON.stringify(l)).join(" | ")};\n`;
out += `${ind(2)}};\n${ind(2)}CompositeTypes: {\n${ind(3)}[_ in never]: never;\n${ind(2)}};\n  };\n};

type PublicSchema = Database["public"];
export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];
export type Views<T extends keyof PublicSchema["Views"]> = PublicSchema["Views"][T]["Row"];
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];

export const Constants = {
  public: {
    Enums: {
${enums.map((e) => `      ${key(e.name)}: [${e.labels.map((l) => JSON.stringify(l)).join(", ")}],`).join("\n")}
    },
  },
} as const;
`;
writeFileSync(new URL("../src/lib/database.types.ts", import.meta.url), out);
console.log(`Tipos gerados: ${Object.keys(tables).length} tabelas/visões, ${functions.length} funções, ${enums.length} enums.`);
