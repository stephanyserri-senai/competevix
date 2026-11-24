-- ---------------------------------------------------------------------------
-- SHIM DE TESTE — NÃO APLICAR NO SUPABASE.
-- Reproduz o mínimo dos esquemas `auth` e `storage` e dos papéis do Supabase
-- para validar migrations e políticas RLS num PostgreSQL comum.
-- auth.uid() lê o claim `sub` de `request.jwt.claims`, como no Supabase.
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;

create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select auth.jwt() ->> 'role'
$$;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text not null,
  owner uuid,
  metadata jsonb,
  created_at timestamptz default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;

grant usage on schema auth, storage, extensions to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated, service_role;
grant select on storage.buckets to authenticated, service_role;
grant select on auth.users to service_role;

-- Colunas extras usadas pelo GoTrue, para que o seed de demonstração funcione igual no shim
create extension if not exists pgcrypto with schema extensions;
alter table auth.users
  add column if not exists instance_id uuid,
  add column if not exists aud text,
  add column if not exists role text,
  add column if not exists encrypted_password text,
  add column if not exists email_confirmed_at timestamptz,
  add column if not exists raw_app_meta_data jsonb default '{}'::jsonb,
  add column if not exists updated_at timestamptz default now(),
  add column if not exists confirmation_token text default '',
  add column if not exists recovery_token text default '',
  add column if not exists email_change text default '',
  add column if not exists email_change_token_new text default '';
create table if not exists auth.identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  provider_id text not null,
  provider text not null,
  identity_data jsonb not null,
  last_sign_in_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (provider_id, provider)
);
