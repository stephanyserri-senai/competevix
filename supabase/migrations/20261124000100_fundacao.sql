-- =============================================================================
-- COMPETE VIX — 0100 Fundação: tipos, perfis, catálogo, programas e vínculos
-- PRD §4 (perfis), §8 (modelo relacional). Convenções:
--   * IDs UUID, created_at/updated_at/created_by;
--   * arquivamento lógico (archived_at) em vez de DELETE para registros históricos;
--   * datas de negócio em `date`, instantes em `timestamptz` (UTC no banco);
--   * FKs compostas (id, program_id) garantem integridade de escopo.
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------------
-- Tipos enumerados
-- ---------------------------------------------------------------------------
create type public.competition_kind as enum ('worldskills', 'inova', 'frc', 'giaffone', 'ekart', 'outra');
create type public.program_status as enum ('planejamento', 'ativo', 'encerrado');
create type public.membership_role as enum ('supervisao', 'orientador', 'competidor', 'gestao', 'avaliador', 'napi');
create type public.team_member_role as enum ('competidor', 'suplente', 'orientador_titular', 'orientador_reserva');
create type public.person_kind as enum ('aluno', 'docente', 'colaborador', 'externo');

-- ---------------------------------------------------------------------------
-- Utilitários genéricos
-- ---------------------------------------------------------------------------
create or replace function private.today() returns date
language sql stable set search_path = '' as $$
  -- "Hoje" de negócio no fuso da instituição (PRD §3: apresentação em America/Sao_Paulo)
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

create or replace function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Perfis (1:1 com auth.users) e administradores da plataforma
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 2 and 120),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'Perfil do usuário autenticado. Sem dados sensíveis; e-mail permanece em auth.users.';

-- Administrador: provisionamento e configurações (PRD §4). Gerido apenas por SQL/service role.
create table public.platform_admins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references public.profiles (id)
);

create or replace function private.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(coalesce(new.email, 'usuario'), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Catálogo institucional
-- ---------------------------------------------------------------------------
create table public.units (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9][A-Z0-9_-]{1,19}$'),
  name text not null check (length(btrim(name)) between 2 and 120),
  active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id)
);

create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9][A-Z0-9_-]{1,19}$'),
  name text not null check (length(btrim(name)) between 2 and 120),
  kind public.competition_kind not null default 'outra',
  description text check (length(description) <= 2000),
  active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id)
);

create table public.cycles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9][A-Z0-9_-]{1,19}$'),
  name text not null check (length(btrim(name)) between 2 and 120),
  -- Datas opcionais: o PRD não fixa calendário oficial (§14). Não inventar.
  start_date date,
  end_date date,
  active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  constraint cycles_dates_ck check (start_date is null or end_date is null or end_date >= start_date)
);

-- Programa = competição × ciclo × unidade: unidade de escopo de autorização.
create table public.programs (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id),
  cycle_id uuid not null references public.cycles (id),
  unit_id uuid not null references public.units (id),
  status public.program_status not null default 'planejamento',
  -- Parâmetros configuráveis (validados por Zod na aplicação), ex.:
  -- {"acao_conclusao_exige": "nota" | "evidencia" | "nota_ou_evidencia" | "nada"}
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  constraint programs_scope_uk unique (competition_id, cycle_id, unit_id)
);
create index programs_cycle_idx on public.programs (cycle_id);
create index programs_unit_idx on public.programs (unit_id);

-- Escopo de programa imutável: impede "mover" dados para outra unidade/ciclo.
create or replace function private.programs_lock_scope() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.competition_id <> old.competition_id or new.cycle_id <> old.cycle_id or new.unit_id <> old.unit_id then
    raise exception 'O escopo do programa (competição, ciclo, unidade) não pode ser alterado; crie um novo programa.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger programs_lock_scope before update on public.programs
  for each row execute function private.programs_lock_scope();

-- Etapas da competição no programa (seletiva, estadual, nacional, banca...)
create table public.stages (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id),
  name text not null check (length(btrim(name)) between 2 and 120),
  position smallint not null default 0 check (position >= 0),
  start_date date,
  end_date date,
  location text check (length(location) <= 200),
  notes text check (length(notes) <= 2000),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  constraint stages_dates_ck check (start_date is null or end_date is null or end_date >= start_date),
  constraint stages_scope_uk unique (id, program_id)
);
create index stages_program_idx on public.stages (program_id);

-- Ocupações (WorldSkills) / categorias por programa
create table public.occupations (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id),
  code text not null check (length(btrim(code)) between 1 and 20),
  name text not null check (length(btrim(name)) between 2 and 120),
  target_score numeric(8,2) check (target_score >= 0),
  -- Origem obrigatória quando há meta: evita meta "sem fonte" (PRD §6: validar).
  target_source text check (length(target_source) <= 300),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  constraint occupations_code_uk unique (program_id, code),
  constraint occupations_scope_uk unique (id, program_id),
  constraint occupations_target_source_ck check (target_score is null or target_source is not null)
);
create index occupations_program_idx on public.occupations (program_id);

-- ---------------------------------------------------------------------------
-- Vínculos de acesso (memberships)
-- ---------------------------------------------------------------------------
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  program_id uuid references public.programs (id),
  -- Vínculo por unidade inteira: apenas Supervisão e Gestão.
  unit_id uuid references public.units (id),
  role public.membership_role not null,
  valid_from date not null default private.today(),
  valid_to date,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id),
  note text check (length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  constraint memberships_one_scope_ck check (num_nonnulls(program_id, unit_id) = 1),
  constraint memberships_unit_roles_ck check (unit_id is null or role in ('supervisao', 'gestao')),
  constraint memberships_validity_ck check (valid_to is null or valid_to >= valid_from)
);
create index memberships_user_idx on public.memberships (user_id) where revoked_at is null;
create index memberships_program_idx on public.memberships (program_id);
create index memberships_unit_idx on public.memberships (unit_id);
create unique index memberships_active_uk
  on public.memberships (user_id, coalesce(program_id, unit_id), role, valid_from)
  where revoked_at is null;

-- ---------------------------------------------------------------------------
-- Pessoas (podem não ter login) e equipes
-- ---------------------------------------------------------------------------
create table public.people (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units (id),
  full_name text not null check (length(btrim(full_name)) between 2 and 160),
  kind public.person_kind not null,
  -- Contato mínimo autorizado (LGPD: minimização). Opcional.
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  user_id uuid unique references public.profiles (id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id)
);
create index people_unit_idx on public.people (unit_id);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id),
  occupation_id uuid,
  name text not null check (length(btrim(name)) between 2 and 120),
  notes text check (length(notes) <= 2000),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  constraint teams_scope_uk unique (id, program_id),
  constraint teams_name_uk unique (program_id, name),
  constraint teams_occupation_fk foreign key (occupation_id, program_id)
    references public.occupations (id, program_id)
);
create index teams_program_idx on public.teams (program_id);
create index teams_occupation_idx on public.teams (occupation_id);

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  program_id uuid not null,
  person_id uuid not null references public.people (id),
  role public.team_member_role not null,
  valid_from date not null default private.today(),
  valid_to date,
  note text check (length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  constraint team_members_team_fk foreign key (team_id, program_id) references public.teams (id, program_id),
  constraint team_members_validity_ck check (valid_to is null or valid_to >= valid_from)
);
create index team_members_team_idx on public.team_members (team_id);
create index team_members_person_idx on public.team_members (person_id);
-- Mesma pessoa não pode ter dois vínculos simultâneos com o mesmo papel na mesma equipe.
create extension if not exists btree_gist with schema extensions;
alter table public.team_members add constraint team_members_no_overlap
  exclude using gist (
    team_id with =, person_id with =, role with =,
    daterange(valid_from, coalesce(valid_to, 'infinity'::date), '[]') with &&
  );

-- updated_at
create trigger units_touch before update on public.units for each row execute function private.touch_updated_at();
create trigger competitions_touch before update on public.competitions for each row execute function private.touch_updated_at();
create trigger cycles_touch before update on public.cycles for each row execute function private.touch_updated_at();
create trigger programs_touch before update on public.programs for each row execute function private.touch_updated_at();
create trigger stages_touch before update on public.stages for each row execute function private.touch_updated_at();
create trigger occupations_touch before update on public.occupations for each row execute function private.touch_updated_at();
create trigger memberships_touch before update on public.memberships for each row execute function private.touch_updated_at();
create trigger people_touch before update on public.people for each row execute function private.touch_updated_at();
create trigger teams_touch before update on public.teams for each row execute function private.touch_updated_at();
create trigger team_members_touch before update on public.team_members for each row execute function private.touch_updated_at();
