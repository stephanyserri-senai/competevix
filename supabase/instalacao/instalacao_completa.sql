-- =============================================================================
-- COMPETE VIX — INSTALAÇÃO COMPLETA DO BANCO (gerado por scripts/bundle-sql.sh)
-- Execute UMA ÚNICA VEZ, num projeto Supabase novo, pelo SQL Editor.
-- Tudo roda numa transação: se algo falhar, nada é aplicado.
-- Conteúdo: migrations de supabase/migrations + supabase/seed/references.sql.
-- NÃO inclui dados de demonstração.
-- =============================================================================
begin;

-- >>>>> supabase/migrations/20261124000100_fundacao.sql
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

-- >>>>> supabase/migrations/20261124000200_autorizacao.sql
-- =============================================================================
-- COMPETE VIX — 0200 Autorização: funções de escopo e políticas RLS da fundação
-- PRD §4: negar por padrão; RLS por vínculo ativo, unidade, ciclo e equipe;
-- não confiar em filtros da interface nem em papel enviado pelo cliente.
--
-- Todas as funções são SECURITY DEFINER com search_path vazio e leem SEMPRE
-- auth.uid() — nunca recebem o usuário ou o papel como parâmetro.
-- =============================================================================

grant usage on schema private to authenticated, service_role;

-- Usuário autenticado e com perfil ativo
create or replace function private.is_active_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.active)
$$;

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.platform_admins a
    join public.profiles p on p.id = a.user_id and p.active
    where a.user_id = auth.uid()
  )
$$;

-- Papéis vigentes do usuário corrente num programa (vínculo direto ou por unidade)
create or replace function private.program_roles(p_program uuid) returns public.membership_role[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct m.role), '{}'::public.membership_role[])
  from public.programs pr
  join public.memberships m on (m.program_id = pr.id or m.unit_id = pr.unit_id)
  join public.profiles p on p.id = m.user_id and p.active
  where pr.id = p_program
    and m.user_id = auth.uid()
    and m.revoked_at is null
    and m.valid_from <= private.today()
    and (m.valid_to is null or m.valid_to >= private.today())
$$;

create or replace function private.has_program_role(p_program uuid, p_roles public.membership_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.program_roles(p_program) && p_roles
$$;

-- Qualquer papel operacional (exclui avaliador e NAPI, que têm acesso próprio e restrito)
create or replace function private.is_program_member(p_program uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_program_role(p_program, '{supervisao,gestao,orientador,competidor}')
$$;

-- Supervisão com alcance sobre a unidade (vínculo por unidade ou em algum programa da unidade)
create or replace function private.supervises_unit(p_unit uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    join public.profiles p on p.id = m.user_id and p.active
    left join public.programs pr on pr.id = m.program_id
    where m.user_id = auth.uid()
      and m.role = 'supervisao'
      and m.revoked_at is null
      and m.valid_from <= private.today()
      and (m.valid_to is null or m.valid_to >= private.today())
      and (m.unit_id = p_unit or pr.unit_id = p_unit)
  )
$$;

-- Vínculo vigente por UNIDADE inteira com determinado papel (ex.: criar programas na unidade)
create or replace function private.has_unit_role(p_unit uuid, p_role public.membership_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    join public.profiles p on p.id = m.user_id and p.active
    where m.user_id = auth.uid() and m.unit_id = p_unit and m.role = p_role
      and m.revoked_at is null
      and m.valid_from <= private.today()
      and (m.valid_to is null or m.valid_to >= private.today())
  )
$$;

-- Leitura de pessoas da unidade: supervisão ou gestão com alcance na unidade
create or replace function private.reads_unit_people(p_unit uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    join public.profiles p on p.id = m.user_id and p.active
    left join public.programs pr on pr.id = m.program_id
    where m.user_id = auth.uid()
      and m.role in ('supervisao', 'gestao')
      and m.revoked_at is null
      and m.valid_from <= private.today()
      and (m.valid_to is null or m.valid_to >= private.today())
      and (m.unit_id = p_unit or pr.unit_id = p_unit)
  )
$$;

-- Vínculo vigente do usuário corrente com uma equipe, por papel de equipe
create or replace function private.team_roles(p_team uuid) returns public.team_member_role[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct tm.role), '{}'::public.team_member_role[])
  from public.team_members tm
  join public.people pe on pe.id = tm.person_id and pe.archived_at is null
  where tm.team_id = p_team
    and pe.user_id = auth.uid()
    and tm.valid_from <= private.today()
    and (tm.valid_to is null or tm.valid_to >= private.today())
$$;

-- Orientador da equipe = papel "orientador" vigente no programa E vínculo de orientação na equipe
create or replace function private.is_team_advisor(p_program uuid, p_team uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_team is not null
     and private.has_program_role(p_program, '{orientador}')
     and private.team_roles(p_team) && '{orientador_titular,orientador_reserva}'::public.team_member_role[]
$$;

create or replace function private.is_team_competitor(p_program uuid, p_team uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_team is not null
     and private.has_program_role(p_program, '{competidor}')
     and private.team_roles(p_team) && '{competidor,suplente}'::public.team_member_role[]
$$;

-- Leitura de um registro operacional com escopo (programa, equipe opcional)
--   Supervisão/Gestão: todo o programa
--   Orientador: registros gerais do programa (sem equipe) e das equipes que orienta
--   Competidor: apenas registros das equipes de que participa
create or replace function private.can_read_scope(p_program uuid, p_team uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  r public.membership_role[] := private.program_roles(p_program);
begin
  if r && '{supervisao,gestao}'::public.membership_role[] then return true; end if;
  if 'orientador' = any (r) and (p_team is null or private.is_team_advisor(p_program, p_team)) then return true; end if;
  if 'competidor' = any (r) and private.is_team_competitor(p_program, p_team) then return true; end if;
  return false;
end $$;

-- Edição: Supervisão no programa; Orientador apenas nas equipes atribuídas.
-- Gestão é leitura (decisões orçamentárias entram na etapa 4).
create or replace function private.can_manage_scope(p_program uuid, p_team uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_program_role(p_program, '{supervisao}')
      or private.is_team_advisor(p_program, p_team)
$$;

-- Pessoa visível ao usuário corrente. A versão "_row" avalia as colunas da própria linha
-- (necessário para INSERT ... RETURNING, quando a linha ainda não existe na tabela).
create or replace function private.can_read_person_row(p_person uuid, p_unit uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_active_user() and (
    p_user = auth.uid()
    or private.reads_unit_people(p_unit)
    or exists (
      select 1 from public.team_members tm
      where tm.person_id = p_person
        and private.can_read_scope(tm.program_id, tm.team_id)
    )
  )
$$;

create or replace function private.can_read_person(p_person uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.people pe
    where pe.id = p_person and private.can_read_person_row(pe.id, pe.unit_id, pe.user_id)
  )
$$;

-- Garante que referências a pessoas feitas pelo usuário apontem para pessoas que ele enxerga
-- (impede "sondar" UUIDs alheios e vincular pessoas de outra unidade sem permissão).
create or replace function private.assert_person_visible(p_person uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_person is not null and auth.uid() is not null and not private.can_read_person(p_person) then
    raise exception 'Pessoa não encontrada no seu escopo.' using errcode = 'insufficient_privilege';
  end if;
end $$;

grant execute on all functions in schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Privilégios de tabela: anon não acessa nada; authenticated passa pelo RLS.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
grant select, insert, update on
  public.profiles, public.units, public.competitions, public.cycles, public.programs,
  public.stages, public.occupations, public.memberships, public.people, public.teams,
  public.team_members
  to authenticated;
grant select on public.platform_admins to authenticated;
grant delete on public.team_members to authenticated;
grant all on all tables in schema public to service_role;

alter table public.profiles enable row level security;
alter table public.platform_admins enable row level security;
alter table public.units enable row level security;
alter table public.competitions enable row level security;
alter table public.cycles enable row level security;
alter table public.programs enable row level security;
alter table public.stages enable row level security;
alter table public.occupations enable row level security;
alter table public.memberships enable row level security;
alter table public.people enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;

-- Perfis: o próprio, administradores e colegas com programa em comum (para exibir nomes)
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid()
  or private.is_admin()
  or exists (
    select 1 from public.memberships m
    where m.user_id = profiles.id and m.revoked_at is null
      and m.program_id is not null and private.is_program_member(m.program_id)
  )
);
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or private.is_admin())
  with check (id = auth.uid() or private.is_admin());

-- Somente administradores alteram o campo "active" (revogação de acesso)
create or replace function private.profiles_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.active is distinct from old.active and auth.uid() is not null and not private.is_admin() then
    raise exception 'Apenas administradores alteram o status do usuário.' using errcode = 'insufficient_privilege';
  end if;
  if new.active = false and new.id = auth.uid() then
    raise exception 'Não é possível desativar o próprio usuário.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles
  for each row execute function private.profiles_guard();

create policy platform_admins_select on public.platform_admins for select to authenticated
  using (user_id = auth.uid() or private.is_admin());

-- Catálogo (não sensível): leitura para usuários ativos; escrita para administradores.
create policy units_select on public.units for select to authenticated using (private.is_active_user());
create policy units_insert on public.units for insert to authenticated with check (private.is_admin());
create policy units_update on public.units for update to authenticated using (private.is_admin()) with check (private.is_admin());

create policy competitions_select on public.competitions for select to authenticated using (private.is_active_user());
create policy competitions_insert on public.competitions for insert to authenticated with check (private.is_admin());
create policy competitions_update on public.competitions for update to authenticated using (private.is_admin()) with check (private.is_admin());

create policy cycles_select on public.cycles for select to authenticated using (private.is_active_user());
create policy cycles_insert on public.cycles for insert to authenticated with check (private.is_admin());
create policy cycles_update on public.cycles for update to authenticated using (private.is_admin()) with check (private.is_admin());

-- Programas: membros e administradores leem; administradores ou supervisão da unidade criam;
-- administradores e supervisão do programa editam (escopo é imutável por trigger).
-- has_unit_role avalia a coluna unit_id da linha (necessário no INSERT ... RETURNING);
-- não amplia acesso: vínculo por unidade já alcança todos os programas da unidade.
create policy programs_select on public.programs for select to authenticated using (
  private.is_admin() or private.is_program_member(id)
  or private.has_unit_role(unit_id, 'supervisao') or private.has_unit_role(unit_id, 'gestao')
);
create policy programs_insert on public.programs for insert to authenticated with check (
  private.is_admin() or private.has_unit_role(unit_id, 'supervisao')
);
create policy programs_update on public.programs for update to authenticated
  using (private.is_admin() or private.has_program_role(id, '{supervisao}'))
  with check (private.is_admin() or private.has_program_role(id, '{supervisao}'));

create policy stages_select on public.stages for select to authenticated using (private.is_program_member(program_id));
create policy stages_insert on public.stages for insert to authenticated with check (private.has_program_role(program_id, '{supervisao}'));
create policy stages_update on public.stages for update to authenticated
  using (private.has_program_role(program_id, '{supervisao}')) with check (private.has_program_role(program_id, '{supervisao}'));

create policy occupations_select on public.occupations for select to authenticated using (private.is_program_member(program_id));
create policy occupations_insert on public.occupations for insert to authenticated with check (private.has_program_role(program_id, '{supervisao}'));
create policy occupations_update on public.occupations for update to authenticated
  using (private.has_program_role(program_id, '{supervisao}')) with check (private.has_program_role(program_id, '{supervisao}'));

-- Vínculos: administradores gerenciam; o usuário vê os próprios; supervisão vê os do programa.
create policy memberships_select on public.memberships for select to authenticated using (
  user_id = auth.uid()
  or private.is_admin()
  or (program_id is not null and private.has_program_role(program_id, '{supervisao}'))
);
create policy memberships_insert on public.memberships for insert to authenticated with check (private.is_admin());
create policy memberships_update on public.memberships for update to authenticated
  using (private.is_admin()) with check (private.is_admin());

-- Pessoas
create policy people_select on public.people for select to authenticated using (private.can_read_person_row(id, unit_id, user_id));
create policy people_insert on public.people for insert to authenticated with check (private.supervises_unit(unit_id));
create policy people_update on public.people for update to authenticated
  using (private.supervises_unit(unit_id)) with check (private.supervises_unit(unit_id));

-- Equipes
create policy teams_select on public.teams for select to authenticated using (private.can_read_scope(program_id, id));
create policy teams_insert on public.teams for insert to authenticated with check (private.has_program_role(program_id, '{supervisao}'));
create policy teams_update on public.teams for update to authenticated
  using (private.has_program_role(program_id, '{supervisao}')) with check (private.has_program_role(program_id, '{supervisao}'));

create policy team_members_select on public.team_members for select to authenticated using (private.can_read_scope(program_id, team_id));
create policy team_members_insert on public.team_members for insert to authenticated with check (private.has_program_role(program_id, '{supervisao}'));
create policy team_members_update on public.team_members for update to authenticated
  using (private.has_program_role(program_id, '{supervisao}')) with check (private.has_program_role(program_id, '{supervisao}'));
-- Exclusão só para corrigir lançamento do mesmo dia; histórico normal usa valid_to.
create policy team_members_delete on public.team_members for delete to authenticated
  using (private.has_program_role(program_id, '{supervisao}') and created_at > now() - interval '1 day');

create or replace function private.team_members_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_person_visible(new.person_id);
  return new;
end $$;
create trigger team_members_guard before insert or update of person_id on public.team_members
  for each row execute function private.team_members_guard();

-- Lista de usuários para o administrador (e-mail fica em auth.users; não exposto a terceiros)
create or replace function public.admin_list_users()
returns table (id uuid, email text, display_name text, active boolean, is_admin boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'Acesso restrito a administradores.' using errcode = 'insufficient_privilege';
  end if;
  return query
    select p.id, u.email::text, p.display_name, p.active,
           exists (select 1 from public.platform_admins a where a.user_id = p.id), p.created_at
    from public.profiles p join auth.users u on u.id = p.id
    order by p.display_name;
end $$;
revoke execute on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;

-- Resumo de acesso do usuário corrente (para a UI decidir o que exibir; o banco continua decidindo o que retorna)
create or replace function public.my_access()
returns table (program_id uuid, roles public.membership_role[], is_admin boolean)
language sql stable security definer set search_path = '' as $$
  select pr.id, private.program_roles(pr.id), private.is_admin()
  from public.programs pr
  where private.program_roles(pr.id) <> '{}'::public.membership_role[]
  union all
  select null::uuid, '{}'::public.membership_role[], private.is_admin()
$$;
revoke execute on function public.my_access() from public, anon;
grant execute on function public.my_access() to authenticated;

-- >>>>> supabase/migrations/20261124000300_documentos.sql
-- =============================================================================
-- COMPETE VIX — 0300 Documentos privados (núcleo do RF13, usado como evidência)
-- PRD §10: Storage privado, URLs assinadas de curta duração, validação MIME/tamanho,
-- nomes aleatórios. Vínculos por tabelas de associação com FK por tipo (§8).
-- =============================================================================

create type public.document_classification as enum ('interno', 'restrito', 'confidencial');

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id),
  team_id uuid,
  title text not null check (length(btrim(title)) between 2 and 200),
  original_name text not null check (length(original_name) between 1 and 255),
  -- Caminho aleatório gerado pelo servidor: {program_id}/{uuid}.{ext}
  storage_path text not null unique,
  mime_type text not null check (mime_type in (
    'application/pdf', 'image/png', 'image/jpeg', 'image/webp',
    'text/plain', 'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  )),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 20971520),
  classification public.document_classification not null default 'interno',
  version integer not null default 1 check (version >= 1),
  supersedes_id uuid,
  uploaded_by uuid not null default auth.uid() references public.profiles (id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  constraint documents_scope_uk unique (id, program_id),
  constraint documents_team_fk foreign key (team_id, program_id) references public.teams (id, program_id),
  constraint documents_supersedes_fk foreign key (supersedes_id, program_id) references public.documents (id, program_id),
  constraint documents_path_ck check (
    storage_path ~ ('^' || program_id::text || '/[0-9a-f-]{36}\.[a-z0-9]{1,8}$')
  )
);
create index documents_program_idx on public.documents (program_id);
create index documents_team_idx on public.documents (team_id);

-- Confidencial: apenas supervisão do programa e quem enviou.
-- A versão "_row" avalia colunas da linha (necessária para INSERT ... RETURNING).
create or replace function private.can_read_document_row(
  p_program uuid, p_team uuid, p_class public.document_classification, p_uploader uuid
) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_read_scope(p_program, p_team)
     and (p_class <> 'confidencial' or p_uploader = auth.uid() or private.has_program_role(p_program, '{supervisao}'))
$$;

create or replace function private.can_read_document(p_doc uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.documents d
    where d.id = p_doc and private.can_read_document_row(d.program_id, d.team_id, d.classification, d.uploaded_by)
  )
$$;

create or replace function private.can_read_storage_object(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.documents d
    where d.storage_path = p_name and private.can_read_document(d.id)
  )
$$;

grant execute on function private.can_read_document(uuid), private.can_read_storage_object(text),
  private.can_read_document_row(uuid, uuid, public.document_classification, uuid) to authenticated;

grant select, insert, update, delete on public.documents to authenticated;
alter table public.documents enable row level security;

create policy documents_select on public.documents for select to authenticated
  using (private.can_read_document_row(program_id, team_id, classification, uploaded_by));
-- Quem gerencia o escopo pode registrar documentos; uploaded_by é sempre o próprio usuário.
create policy documents_insert on public.documents for insert to authenticated with check (
  uploaded_by = auth.uid() and private.can_manage_scope(program_id, team_id)
);
-- Atualização apenas para arquivar/reclassificar (supervisão ou autor).
create policy documents_update on public.documents for update to authenticated
  using (private.has_program_role(program_id, '{supervisao}') or uploaded_by = auth.uid())
  with check (private.can_manage_scope(program_id, team_id) or uploaded_by = auth.uid());
-- Exclusão só do próprio registro recém-criado (desfazer upload que falhou).
create policy documents_delete on public.documents for delete to authenticated
  using (uploaded_by = auth.uid() and created_at > now() - interval '15 minutes');

-- Campos que identificam o arquivo são imutáveis (nova versão = novo registro).
create or replace function private.documents_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.storage_path <> old.storage_path or new.program_id <> old.program_id
     or new.mime_type <> old.mime_type or new.size_bytes <> old.size_bytes
     or new.uploaded_by <> old.uploaded_by or new.version <> old.version then
    raise exception 'Arquivo registrado é imutável; envie uma nova versão.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger documents_guard before update on public.documents
  for each row execute function private.documents_guard();

-- Versão sequencial a partir do documento substituído
create or replace function private.documents_set_version() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.supersedes_id is not null then
    select d.version + 1 into new.version from public.documents d where d.id = new.supersedes_id;
  else
    new.version := 1;
  end if;
  return new;
end $$;
create trigger documents_set_version before insert on public.documents
  for each row execute function private.documents_set_version();

-- ---------------------------------------------------------------------------
-- Storage: bucket privado e políticas espelhando o RLS de documents
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', false, 20971520, array[
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain', 'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy documentos_select on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and private.can_read_storage_object(name));

-- Upload só é aceito se já existe o registro em documents, feito pelo mesmo usuário.
create policy documentos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documentos'
    and exists (
      select 1 from public.documents d
      where d.storage_path = name and d.uploaded_by = auth.uid() and d.archived_at is null
    )
  );
-- Sem políticas de UPDATE/DELETE: arquivos são imutáveis para clientes.

-- >>>>> supabase/migrations/20261124000400_agenda.sql
-- =============================================================================
-- COMPETE VIX — 0400 Agenda (RF04): eventos, recorrência, exceções e participantes
-- Recorrência armazenada como subconjunto de RRULE (RFC 5545): FREQ, INTERVAL,
-- BYDAY, UNTIL/COUNT. A expansão das ocorrências é feita no domínio (TypeScript)
-- e na exportação ICS. Exceções são editáveis por ocorrência.
-- =============================================================================

create type public.event_type as enum ('treino', 'reuniao', 'simulado', 'banca', 'visita', 'competicao', 'prazo', 'outro');
create type public.recurrence_freq as enum ('diaria', 'semanal', 'mensal');
create type public.event_exception_kind as enum ('cancelada', 'alterada');

create table public.events (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id),
  team_id uuid,
  title text not null check (length(btrim(title)) between 2 and 200),
  description text check (length(description) <= 4000),
  type public.event_type not null default 'outro',
  location text check (length(location) <= 200),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  owner_person_id uuid references public.people (id),
  recurrence_freq public.recurrence_freq,
  recurrence_interval smallint not null default 1 check (recurrence_interval between 1 and 52),
  -- Dias da semana 0=domingo … 6=sábado (apenas para recorrência semanal)
  recurrence_weekdays smallint[] check (recurrence_weekdays <@ array[0,1,2,3,4,5,6]::smallint[]),
  recurrence_until date,
  recurrence_count smallint check (recurrence_count between 1 and 500),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  constraint events_scope_uk unique (id, program_id),
  constraint events_team_fk foreign key (team_id, program_id) references public.teams (id, program_id),
  constraint events_time_ck check (ends_at > starts_at and ends_at - starts_at <= interval '14 days'),
  constraint events_recurrence_end_ck check (recurrence_until is null or recurrence_count is null),
  constraint events_recurrence_bounded_ck check (
    recurrence_freq is null or recurrence_until is not null or recurrence_count is not null
  ),
  constraint events_weekdays_ck check (recurrence_weekdays is null or recurrence_freq = 'semanal')
);
create index events_program_time_idx on public.events (program_id, starts_at);
create index events_team_idx on public.events (team_id);
create index events_owner_idx on public.events (owner_person_id);

create table public.event_participants (
  event_id uuid not null,
  program_id uuid not null,
  person_id uuid not null references public.people (id),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  primary key (event_id, person_id),
  constraint event_participants_event_fk foreign key (event_id, program_id)
    references public.events (id, program_id) on delete cascade
);
create index event_participants_person_idx on public.event_participants (person_id);

create table public.event_exceptions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  program_id uuid not null,
  -- Início ORIGINAL da ocorrência afetada (identificador da ocorrência, como RECURRENCE-ID)
  occurrence_start timestamptz not null,
  kind public.event_exception_kind not null,
  new_starts_at timestamptz,
  new_ends_at timestamptz,
  new_title text check (length(btrim(new_title)) between 2 and 200),
  new_location text check (length(new_location) <= 200),
  note text check (length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  constraint event_exceptions_event_fk foreign key (event_id, program_id)
    references public.events (id, program_id) on delete cascade,
  constraint event_exceptions_uk unique (event_id, occurrence_start),
  constraint event_exceptions_change_ck check (
    kind = 'cancelada'
    or (new_starts_at is not null and new_ends_at is not null and new_ends_at > new_starts_at)
  )
);

create trigger events_touch before update on public.events for each row execute function private.touch_updated_at();
create trigger event_exceptions_touch before update on public.event_exceptions for each row execute function private.touch_updated_at();

create or replace function private.events_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_person_visible(new.owner_person_id);
  if tg_op = 'UPDATE' and (new.program_id <> old.program_id) then
    raise exception 'Evento não pode mudar de programa.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger events_guard before insert or update on public.events
  for each row execute function private.events_guard();

create or replace function private.event_participants_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_person_visible(new.person_id);
  return new;
end $$;
create trigger event_participants_guard before insert on public.event_participants
  for each row execute function private.event_participants_guard();

-- Leitura/edição de filhos herdam o escopo do evento
create or replace function private.event_scope_ok(p_event uuid, p_manage boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.events e where e.id = p_event
      and case when p_manage then private.can_manage_scope(e.program_id, e.team_id)
               else private.can_read_scope(e.program_id, e.team_id) end
  )
$$;
grant execute on function private.event_scope_ok(uuid, boolean) to authenticated;

grant select, insert, update on public.events to authenticated;
grant select, insert, delete on public.event_participants to authenticated;
grant select, insert, update, delete on public.event_exceptions to authenticated;

alter table public.events enable row level security;
alter table public.event_participants enable row level security;
alter table public.event_exceptions enable row level security;

create policy events_select on public.events for select to authenticated
  using (private.can_read_scope(program_id, team_id));
create policy events_insert on public.events for insert to authenticated
  with check (private.can_manage_scope(program_id, team_id));
create policy events_update on public.events for update to authenticated
  using (private.can_manage_scope(program_id, team_id))
  with check (private.can_manage_scope(program_id, team_id));

create policy event_participants_select on public.event_participants for select to authenticated
  using (private.event_scope_ok(event_id, false));
create policy event_participants_insert on public.event_participants for insert to authenticated
  with check (private.event_scope_ok(event_id, true));
create policy event_participants_delete on public.event_participants for delete to authenticated
  using (private.event_scope_ok(event_id, true));

create policy event_exceptions_select on public.event_exceptions for select to authenticated
  using (private.event_scope_ok(event_id, false));
create policy event_exceptions_insert on public.event_exceptions for insert to authenticated
  with check (private.event_scope_ok(event_id, true));
create policy event_exceptions_update on public.event_exceptions for update to authenticated
  using (private.event_scope_ok(event_id, true)) with check (private.event_scope_ok(event_id, true));
create policy event_exceptions_delete on public.event_exceptions for delete to authenticated
  using (private.event_scope_ok(event_id, true));

-- >>>>> supabase/migrations/20261124000500_acoes.sql
-- =============================================================================
-- COMPETE VIX — 0500 Ações (RF05): responsável, prazo, prioridade, dependências,
-- evidências e histórico. PRD §9: aberta → em andamento → bloqueada →
-- concluída/cancelada; reabertura auditada; atraso calculado (não é status manual).
-- =============================================================================

create type public.action_status as enum ('aberta', 'em_andamento', 'bloqueada', 'concluida', 'cancelada');
create type public.action_priority as enum ('baixa', 'media', 'alta', 'critica');
create type public.action_history_kind as enum ('criada', 'status', 'edicao', 'comentario', 'evidencia', 'dependencia');

create table public.actions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id),
  team_id uuid,
  title text not null check (length(btrim(title)) between 3 and 200),
  description text check (length(description) <= 4000),
  owner_person_id uuid references public.people (id),
  -- Prazo opcional: o backlog da reunião não tem datas e não devem ser inventadas (PRD §11)
  due_date date,
  start_date date,
  status public.action_status not null default 'aberta',
  priority public.action_priority not null default 'media',
  -- Exigência de evidência por ação (além da regra do programa em programs.settings)
  requires_evidence boolean not null default false,
  completion_note text check (length(completion_note) <= 4000),
  blocked_reason text check (length(blocked_reason) <= 1000),
  completed_at timestamptz,
  completed_by uuid references public.profiles (id),
  -- Origem rastreável (ex.: reunião de 24/11/2026) e chave para importação idempotente
  origin text check (length(origin) <= 200),
  origin_key text check (length(origin_key) <= 120),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  constraint actions_scope_uk unique (id, program_id),
  constraint actions_team_fk foreign key (team_id, program_id) references public.teams (id, program_id),
  constraint actions_origin_uk unique (program_id, origin_key),
  constraint actions_dates_ck check (start_date is null or due_date is null or due_date >= start_date),
  constraint actions_blocked_ck check (status <> 'bloqueada' or blocked_reason is not null)
);
create index actions_program_status_idx on public.actions (program_id, status);
create index actions_due_idx on public.actions (due_date) where status not in ('concluida', 'cancelada');
create index actions_owner_idx on public.actions (owner_person_id);
create index actions_team_idx on public.actions (team_id);

create table public.action_dependencies (
  action_id uuid not null,
  depends_on_id uuid not null,
  program_id uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  primary key (action_id, depends_on_id),
  constraint action_dependencies_self_ck check (action_id <> depends_on_id),
  constraint action_dependencies_action_fk foreign key (action_id, program_id) references public.actions (id, program_id),
  constraint action_dependencies_dep_fk foreign key (depends_on_id, program_id) references public.actions (id, program_id)
);
create index action_dependencies_dep_idx on public.action_dependencies (depends_on_id);

create table public.action_evidences (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null,
  program_id uuid not null,
  document_id uuid,
  url text check (url ~* '^https://[^[:space:]]+$' and length(url) <= 2000),
  note text check (length(note) <= 2000),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references public.profiles (id),
  constraint action_evidences_action_fk foreign key (action_id, program_id) references public.actions (id, program_id),
  constraint action_evidences_document_fk foreign key (document_id, program_id) references public.documents (id, program_id),
  constraint action_evidences_content_ck check (num_nonnulls(document_id, url) >= 1)
);
create index action_evidences_action_idx on public.action_evidences (action_id);
create index action_evidences_document_idx on public.action_evidences (document_id);

create table public.action_history (
  id bigint generated always as identity primary key,
  action_id uuid not null,
  program_id uuid not null,
  kind public.action_history_kind not null,
  from_status public.action_status,
  to_status public.action_status,
  note text check (length(note) <= 4000),
  changes jsonb,
  actor uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint action_history_action_fk foreign key (action_id, program_id) references public.actions (id, program_id)
);
create index action_history_action_idx on public.action_history (action_id, created_at);

create trigger actions_touch before update on public.actions for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Regras de transição e conclusão
-- ---------------------------------------------------------------------------
create or replace function private.action_transition_allowed(p_from public.action_status, p_to public.action_status)
returns boolean language sql immutable set search_path = '' as $$
  select p_from = p_to or (p_from, p_to) in (
    ('aberta', 'em_andamento'), ('aberta', 'bloqueada'), ('aberta', 'concluida'), ('aberta', 'cancelada'),
    ('em_andamento', 'aberta'), ('em_andamento', 'bloqueada'), ('em_andamento', 'concluida'), ('em_andamento', 'cancelada'),
    ('bloqueada', 'aberta'), ('bloqueada', 'em_andamento'), ('bloqueada', 'cancelada'),
    -- Reabertura (auditada no histórico com justificativa)
    ('concluida', 'aberta'), ('cancelada', 'aberta')
  )
$$;

create or replace function private.actions_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_rule text;
  v_evidences integer;
  v_pending integer;
  v_reason text := nullif(btrim(current_setting('app.status_note', true)), '');
begin
  perform private.assert_person_visible(new.owner_person_id);

  if tg_op = 'UPDATE' then
    if new.program_id <> old.program_id then
      raise exception 'A ação não pode mudar de programa.' using errcode = 'check_violation';
    end if;
    if old.status in ('concluida', 'cancelada') and new.status = old.status
       and (new.title, new.description, new.owner_person_id, new.due_date, new.priority, new.team_id)
           is distinct from (old.title, old.description, old.owner_person_id, old.due_date, old.priority, old.team_id) then
      raise exception 'Ação encerrada não pode ser editada; reabra com justificativa.' using errcode = 'check_violation';
    end if;
    if not private.action_transition_allowed(old.status, new.status) then
      raise exception 'Transição de status não permitida: % → %.', old.status, new.status using errcode = 'check_violation';
    end if;
    if old.status in ('concluida', 'cancelada') and new.status = 'aberta' and v_reason is null then
      raise exception 'Reabertura exige justificativa.' using errcode = 'check_violation';
    end if;
  elsif new.status in ('concluida', 'cancelada') then
    raise exception 'Ação nova deve começar em aberto.' using errcode = 'check_violation';
  end if;

  if new.status = 'concluida' and (tg_op = 'INSERT' or old.status <> 'concluida') then
    -- Dependências precisam estar concluídas (ou canceladas)
    select count(*) into v_pending
    from public.action_dependencies d join public.actions a on a.id = d.depends_on_id
    where d.action_id = new.id and a.status not in ('concluida', 'cancelada');
    if v_pending > 0 then
      raise exception 'Existem % dependência(s) não concluída(s).', v_pending using errcode = 'check_violation';
    end if;

    select coalesce(p.settings ->> 'acao_conclusao_exige', 'nada') into v_rule
    from public.programs p where p.id = new.program_id;
    select count(*) into v_evidences from public.action_evidences e where e.action_id = new.id;

    if new.requires_evidence and v_evidences = 0 then
      raise exception 'Esta ação exige evidência para conclusão.' using errcode = 'check_violation';
    end if;
    if v_rule = 'nota' and nullif(btrim(new.completion_note), '') is null then
      raise exception 'O programa exige justificativa de conclusão.' using errcode = 'check_violation';
    elsif v_rule = 'evidencia' and v_evidences = 0 then
      raise exception 'O programa exige evidência para conclusão.' using errcode = 'check_violation';
    elsif v_rule = 'nota_ou_evidencia' and v_evidences = 0 and nullif(btrim(new.completion_note), '') is null then
      raise exception 'O programa exige justificativa ou evidência para conclusão.' using errcode = 'check_violation';
    end if;

    new.completed_at := now();
    new.completed_by := auth.uid();
  elsif new.status <> 'concluida' then
    new.completed_at := null;
    new.completed_by := null;
  end if;

  if new.status <> 'bloqueada' then
    new.blocked_reason := null;
  end if;
  return new;
end $$;
create trigger actions_guard before insert or update on public.actions
  for each row execute function private.actions_guard();

-- Histórico automático (o cliente não consegue forjar entradas de status)
create or replace function private.actions_history() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_changes jsonb := '{}'::jsonb;
  v_note text := nullif(btrim(current_setting('app.status_note', true)), '');
begin
  if tg_op = 'INSERT' then
    insert into public.action_history (action_id, program_id, kind, to_status, note)
    values (new.id, new.program_id, 'criada', new.status, new.origin);
    return new;
  end if;

  if new.status <> old.status then
    insert into public.action_history (action_id, program_id, kind, from_status, to_status, note)
    values (new.id, new.program_id, 'status', old.status, new.status,
            coalesce(v_note, case when new.status = 'concluida' then new.completion_note
                                  when new.status = 'bloqueada' then new.blocked_reason end));
  end if;

  if new.title is distinct from old.title then v_changes := v_changes || jsonb_build_object('title', jsonb_build_array(old.title, new.title)); end if;
  if new.owner_person_id is distinct from old.owner_person_id then v_changes := v_changes || jsonb_build_object('owner_person_id', jsonb_build_array(old.owner_person_id, new.owner_person_id)); end if;
  if new.due_date is distinct from old.due_date then v_changes := v_changes || jsonb_build_object('due_date', jsonb_build_array(old.due_date, new.due_date)); end if;
  if new.priority is distinct from old.priority then v_changes := v_changes || jsonb_build_object('priority', jsonb_build_array(old.priority, new.priority)); end if;
  if new.team_id is distinct from old.team_id then v_changes := v_changes || jsonb_build_object('team_id', jsonb_build_array(old.team_id, new.team_id)); end if;
  if new.requires_evidence is distinct from old.requires_evidence then v_changes := v_changes || jsonb_build_object('requires_evidence', jsonb_build_array(old.requires_evidence, new.requires_evidence)); end if;
  if new.description is distinct from old.description then v_changes := v_changes || jsonb_build_object('description', '"alterada"'::jsonb); end if;
  if new.archived_at is distinct from old.archived_at then v_changes := v_changes || jsonb_build_object('archived', jsonb_build_array(old.archived_at is not null, new.archived_at is not null)); end if;

  if v_changes <> '{}'::jsonb then
    insert into public.action_history (action_id, program_id, kind, changes)
    values (new.id, new.program_id, 'edicao', v_changes);
  end if;
  return new;
end $$;
create trigger actions_history after insert or update on public.actions
  for each row execute function private.actions_history();

-- Dependências: mesmo programa (FK composta) e sem ciclos
create or replace function private.action_dependencies_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    with recursive chain(id) as (
      select new.depends_on_id
      union
      select d.depends_on_id from public.action_dependencies d join chain c on d.action_id = c.id
    )
    select 1 from chain where id = new.action_id
  ) then
    raise exception 'Dependência criaria um ciclo entre ações.' using errcode = 'check_violation';
  end if;
  insert into public.action_history (action_id, program_id, kind, changes)
  values (new.action_id, new.program_id, 'dependencia', jsonb_build_object('adicionada', new.depends_on_id));
  return new;
end $$;
create trigger action_dependencies_guard before insert on public.action_dependencies
  for each row execute function private.action_dependencies_guard();

create or replace function private.action_evidences_history() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.action_history (action_id, program_id, kind, changes)
  values (new.action_id, new.program_id, 'evidencia',
          jsonb_build_object('document_id', new.document_id, 'url', new.url is not null));
  return new;
end $$;
create trigger action_evidences_history after insert on public.action_evidences
  for each row execute function private.action_evidences_history();

-- Alteração de status com justificativa, numa única transação
create or replace function public.set_action_status(p_action uuid, p_status public.action_status, p_note text default null)
returns public.actions
language plpgsql security invoker set search_path = '' as $$
declare
  v_row public.actions;
begin
  perform set_config('app.status_note', coalesce(p_note, ''), true);
  update public.actions a
     set status = p_status,
         completion_note = case when p_status = 'concluida' then coalesce(nullif(btrim(p_note), ''), a.completion_note) else a.completion_note end,
         blocked_reason = case when p_status = 'bloqueada' then nullif(btrim(p_note), '') else null end
   where a.id = p_action
  returning * into v_row;
  if v_row.id is null then
    raise exception 'Ação não encontrada ou sem permissão.' using errcode = 'insufficient_privilege';
  end if;
  perform set_config('app.status_note', '', true);
  return v_row;
end $$;
revoke execute on function public.set_action_status(uuid, public.action_status, text) from public, anon;
grant execute on function public.set_action_status(uuid, public.action_status, text) to authenticated;

-- Visão com atraso calculado (security_invoker: respeita o RLS do usuário)
create view public.actions_view with (security_invoker = true) as
select a.*,
       (a.due_date is not null and a.due_date < private.today() and a.status not in ('concluida', 'cancelada')) as is_overdue,
       case when a.due_date is not null and a.status not in ('concluida', 'cancelada')
            then a.due_date - private.today() end as days_to_due,
       (select count(*) from public.action_evidences e where e.action_id = a.id)::int as evidence_count,
       (select count(*) from public.action_dependencies d
          join public.actions x on x.id = d.depends_on_id
         where d.action_id = a.id and x.status not in ('concluida', 'cancelada'))::int as open_dependencies
from public.actions a;

-- ---------------------------------------------------------------------------
-- Privilégios e RLS
-- ---------------------------------------------------------------------------
grant select, insert, update on public.actions to authenticated;
grant select, insert, delete on public.action_dependencies to authenticated;
grant select, insert on public.action_evidences to authenticated;
grant select, insert on public.action_history to authenticated;
grant select on public.actions_view to authenticated;

alter table public.actions enable row level security;
alter table public.action_dependencies enable row level security;
alter table public.action_evidences enable row level security;
alter table public.action_history enable row level security;

create or replace function private.action_scope_ok(p_action uuid, p_manage boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.actions a where a.id = p_action
      and case when p_manage then private.can_manage_scope(a.program_id, a.team_id)
               else private.can_read_scope(a.program_id, a.team_id) end
  )
$$;
grant execute on function private.action_scope_ok(uuid, boolean) to authenticated;

create policy actions_select on public.actions for select to authenticated
  using (private.can_read_scope(program_id, team_id));
create policy actions_insert on public.actions for insert to authenticated
  with check (private.can_manage_scope(program_id, team_id));
create policy actions_update on public.actions for update to authenticated
  using (private.can_manage_scope(program_id, team_id))
  with check (private.can_manage_scope(program_id, team_id));

create policy action_dependencies_select on public.action_dependencies for select to authenticated
  using (private.action_scope_ok(action_id, false));
create policy action_dependencies_insert on public.action_dependencies for insert to authenticated
  with check (private.action_scope_ok(action_id, true) and private.action_scope_ok(depends_on_id, false));
create policy action_dependencies_delete on public.action_dependencies for delete to authenticated
  using (private.action_scope_ok(action_id, true));

create policy action_evidences_select on public.action_evidences for select to authenticated
  using (private.action_scope_ok(action_id, false));
create policy action_evidences_insert on public.action_evidences for insert to authenticated
  with check (
    created_by = auth.uid()
    and private.action_scope_ok(action_id, true)
    and (document_id is null or private.can_read_document(document_id))
  );

create policy action_history_select on public.action_history for select to authenticated
  using (private.action_scope_ok(action_id, false));
-- Clientes só inserem comentários em seu próprio nome
create policy action_history_insert on public.action_history for insert to authenticated
  with check (kind = 'comentario' and actor = auth.uid() and private.action_scope_ok(action_id, true));

-- >>>>> supabase/migrations/20261124000600_checklists.sql
-- =============================================================================
-- COMPETE VIX — 0600 Checklists versionados (PRD §8: versão, item obrigatório,
-- escopo, período, resposta, evidência). Modelos publicados são imutáveis;
-- alterar um modelo cria nova versão da mesma família.
-- =============================================================================

create type public.checklist_cadence as enum ('semanal', 'mensal', 'avulsa');
create type public.checklist_scope as enum ('programa', 'equipe');
create type public.checklist_template_status as enum ('rascunho', 'publicado', 'substituido');
create type public.checklist_run_status as enum ('aberto', 'concluido');
create type public.checklist_answer_value as enum ('sim', 'nao', 'na');

create table public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id),
  family_id uuid not null default gen_random_uuid(),
  version integer not null default 1 check (version >= 1),
  name text not null check (length(btrim(name)) between 3 and 160),
  description text check (length(description) <= 2000),
  cadence public.checklist_cadence not null,
  scope public.checklist_scope not null,
  status public.checklist_template_status not null default 'rascunho',
  published_at timestamptz,
  published_by uuid references public.profiles (id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  constraint checklist_templates_scope_uk unique (id, program_id),
  constraint checklist_templates_version_uk unique (family_id, version)
);
create index checklist_templates_program_idx on public.checklist_templates (program_id);

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null,
  program_id uuid not null,
  position smallint not null check (position >= 0),
  label text not null check (length(btrim(label)) between 3 and 300),
  guidance text check (length(guidance) <= 1000),
  required boolean not null default true,
  requires_evidence boolean not null default false,
  created_at timestamptz not null default now(),
  constraint checklist_items_template_fk foreign key (template_id, program_id)
    references public.checklist_templates (id, program_id) on delete cascade,
  constraint checklist_items_scope_uk unique (id, template_id),
  constraint checklist_items_position_uk unique (template_id, position)
);

create table public.checklist_runs (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null,
  program_id uuid not null,
  team_id uuid,
  period_start date not null,
  period_end date not null,
  status public.checklist_run_status not null default 'aberto',
  completed_at timestamptz,
  completed_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  constraint checklist_runs_scope_uk unique (id, program_id),
  constraint checklist_runs_template_uk unique (id, template_id),
  constraint checklist_runs_template_fk foreign key (template_id, program_id) references public.checklist_templates (id, program_id),
  constraint checklist_runs_team_fk foreign key (team_id, program_id) references public.teams (id, program_id),
  constraint checklist_runs_period_ck check (period_end >= period_start),
  constraint checklist_runs_period_uk unique nulls not distinct (template_id, team_id, period_start)
);
create index checklist_runs_program_idx on public.checklist_runs (program_id, period_start);
create index checklist_runs_team_idx on public.checklist_runs (team_id);

create table public.checklist_answers (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  template_id uuid not null,
  item_id uuid not null,
  program_id uuid not null,
  value public.checklist_answer_value not null,
  note text check (length(note) <= 2000),
  answered_at timestamptz not null default now(),
  answered_by uuid not null default auth.uid() references public.profiles (id),
  constraint checklist_answers_run_fk foreign key (run_id, template_id) references public.checklist_runs (id, template_id) on delete cascade,
  constraint checklist_answers_item_fk foreign key (item_id, template_id) references public.checklist_items (id, template_id),
  constraint checklist_answers_program_fk foreign key (run_id, program_id) references public.checklist_runs (id, program_id),
  constraint checklist_answers_uk unique (run_id, item_id),
  constraint checklist_answers_scope_uk unique (id, program_id)
);

create table public.checklist_answer_evidences (
  answer_id uuid not null,
  document_id uuid not null,
  program_id uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references public.profiles (id),
  primary key (answer_id, document_id),
  constraint checklist_answer_evidences_answer_fk foreign key (answer_id, program_id) references public.checklist_answers (id, program_id) on delete cascade,
  constraint checklist_answer_evidences_document_fk foreign key (document_id, program_id) references public.documents (id, program_id)
);

create trigger checklist_templates_touch before update on public.checklist_templates for each row execute function private.touch_updated_at();
create trigger checklist_runs_touch before update on public.checklist_runs for each row execute function private.touch_updated_at();

-- Modelo publicado/substituído é imutável (exceto arquivamento e mudança de status pelo fluxo)
create or replace function private.checklist_templates_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status <> 'rascunho' and (new.name, new.description, new.cadence, new.scope, new.family_id, new.version, new.program_id)
     is distinct from (old.name, old.description, old.cadence, old.scope, old.family_id, old.version, old.program_id) then
    raise exception 'Modelo publicado é imutável; crie uma nova versão.' using errcode = 'check_violation';
  end if;
  if old.status = 'substituido' and new.status <> 'substituido' then
    raise exception 'Versão substituída não pode voltar a ser publicada.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger checklist_templates_guard before update on public.checklist_templates
  for each row execute function private.checklist_templates_guard();

create or replace function private.checklist_items_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_status public.checklist_template_status;
begin
  select t.status into v_status from public.checklist_templates t
  where t.id = coalesce(new.template_id, old.template_id);
  if v_status is distinct from 'rascunho' then
    raise exception 'Itens só podem ser alterados em rascunho.' using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end $$;
create trigger checklist_items_guard before insert or update or delete on public.checklist_items
  for each row execute function private.checklist_items_guard();

create or replace function private.checklist_runs_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_t public.checklist_templates;
begin
  select * into v_t from public.checklist_templates t where t.id = new.template_id;
  if tg_op = 'INSERT' then
    if v_t.status <> 'publicado' or v_t.archived_at is not null then
      raise exception 'Só é possível aplicar modelos publicados e ativos.' using errcode = 'check_violation';
    end if;
    if v_t.scope = 'equipe' and new.team_id is null then
      raise exception 'Este checklist é por equipe: informe a equipe.' using errcode = 'check_violation';
    end if;
    if v_t.scope = 'programa' and new.team_id is not null then
      raise exception 'Este checklist é do programa: não informe equipe.' using errcode = 'check_violation';
    end if;
    if new.status <> 'aberto' then
      raise exception 'Aplicação começa aberta.' using errcode = 'check_violation';
    end if;
  else
    if (new.template_id, new.team_id, new.period_start, new.period_end, new.program_id)
       is distinct from (old.template_id, old.team_id, old.period_start, old.period_end, old.program_id) then
      raise exception 'Escopo e período da aplicação são imutáveis.' using errcode = 'check_violation';
    end if;
    if old.status = 'concluido' then
      raise exception 'Checklist concluído é imutável.' using errcode = 'check_violation';
    end if;
    if new.status = 'concluido' and current_setting('app.completing_checklist', true) is distinct from 'on' then
      raise exception 'Use a conclusão de checklist (valida itens obrigatórios).' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
create trigger checklist_runs_guard before insert or update on public.checklist_runs
  for each row execute function private.checklist_runs_guard();

create or replace function private.checklist_answers_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.checklist_runs r where r.id = coalesce(new.run_id, old.run_id) and r.status = 'concluido') then
    raise exception 'Checklist concluído é imutável.' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' then
    new.answered_at := now();
    new.answered_by := auth.uid();
  end if;
  return coalesce(new, old);
end $$;
create trigger checklist_answers_guard before insert or update or delete on public.checklist_answers
  for each row execute function private.checklist_answers_guard();

create or replace function private.checklist_answer_evidences_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.checklist_answers a join public.checklist_runs r on r.id = a.run_id
    where a.id = coalesce(new.answer_id, old.answer_id) and r.status = 'concluido'
  ) then
    raise exception 'Checklist concluído é imutável.' using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end $$;
create trigger checklist_answer_evidences_guard before insert or delete on public.checklist_answer_evidences
  for each row execute function private.checklist_answer_evidences_guard();

-- ---------------------------------------------------------------------------
-- Operações transacionais
-- ---------------------------------------------------------------------------
-- Publica um rascunho e substitui a versão publicada anterior da mesma família.
create or replace function public.publish_checklist_template(p_template uuid)
returns public.checklist_templates
language plpgsql security invoker set search_path = '' as $$
declare v_t public.checklist_templates;
begin
  select * into v_t from public.checklist_templates where id = p_template for update;
  if v_t.id is null then raise exception 'Modelo não encontrado.' using errcode = 'insufficient_privilege'; end if;
  if v_t.status <> 'rascunho' then raise exception 'Apenas rascunhos podem ser publicados.' using errcode = 'check_violation'; end if;
  if not exists (select 1 from public.checklist_items i where i.template_id = v_t.id) then
    raise exception 'Inclua ao menos um item antes de publicar.' using errcode = 'check_violation';
  end if;
  update public.checklist_templates set status = 'substituido'
   where family_id = v_t.family_id and status = 'publicado' and id <> v_t.id;
  update public.checklist_templates set status = 'publicado', published_at = now(), published_by = auth.uid()
   where id = v_t.id returning * into v_t;
  return v_t;
end $$;

-- Cria novo rascunho a partir de uma versão existente (copia os itens)
create or replace function public.new_checklist_version(p_template uuid)
returns public.checklist_templates
language plpgsql security invoker set search_path = '' as $$
declare v_src public.checklist_templates; v_new public.checklist_templates;
begin
  select * into v_src from public.checklist_templates where id = p_template;
  if v_src.id is null then raise exception 'Modelo não encontrado.' using errcode = 'insufficient_privilege'; end if;
  if exists (select 1 from public.checklist_templates where family_id = v_src.family_id and status = 'rascunho') then
    raise exception 'Já existe um rascunho desta família.' using errcode = 'check_violation';
  end if;
  insert into public.checklist_templates (program_id, family_id, version, name, description, cadence, scope)
  select v_src.program_id, v_src.family_id, max(version) + 1, v_src.name, v_src.description, v_src.cadence, v_src.scope
  from public.checklist_templates where family_id = v_src.family_id
  returning * into v_new;
  insert into public.checklist_items (template_id, program_id, position, label, guidance, required, requires_evidence)
  select v_new.id, v_new.program_id, i.position, i.label, i.guidance, i.required, i.requires_evidence
  from public.checklist_items i where i.template_id = v_src.id;
  return v_new;
end $$;

-- Conclui uma aplicação validando obrigatoriedade e evidências
create or replace function public.complete_checklist_run(p_run uuid)
returns public.checklist_runs
language plpgsql security invoker set search_path = '' as $$
declare v_run public.checklist_runs; v_missing int; v_no_evidence int;
begin
  select * into v_run from public.checklist_runs where id = p_run for update;
  if v_run.id is null then raise exception 'Aplicação não encontrada.' using errcode = 'insufficient_privilege'; end if;

  select count(*) into v_missing from public.checklist_items i
  where i.template_id = v_run.template_id and i.required
    and not exists (select 1 from public.checklist_answers a where a.run_id = v_run.id and a.item_id = i.id);
  if v_missing > 0 then
    raise exception 'Faltam % item(ns) obrigatório(s).', v_missing using errcode = 'check_violation';
  end if;

  select count(*) into v_no_evidence from public.checklist_items i
  join public.checklist_answers a on a.item_id = i.id and a.run_id = v_run.id
  where i.requires_evidence and a.value = 'sim'
    and not exists (select 1 from public.checklist_answer_evidences e where e.answer_id = a.id);
  if v_no_evidence > 0 then
    raise exception '% item(ns) exigem evidência anexada.', v_no_evidence using errcode = 'check_violation';
  end if;

  perform set_config('app.completing_checklist', 'on', true);
  update public.checklist_runs set status = 'concluido', completed_at = now(), completed_by = auth.uid()
   where id = v_run.id returning * into v_run;
  perform set_config('app.completing_checklist', '', true);
  if v_run.id is null then raise exception 'Sem permissão para concluir.' using errcode = 'insufficient_privilege'; end if;
  return v_run;
end $$;

revoke execute on function public.publish_checklist_template(uuid), public.new_checklist_version(uuid),
  public.complete_checklist_run(uuid) from public, anon;
grant execute on function public.publish_checklist_template(uuid), public.new_checklist_version(uuid),
  public.complete_checklist_run(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Privilégios e RLS
-- ---------------------------------------------------------------------------
grant select, insert, update on public.checklist_templates to authenticated;
grant select, insert, update, delete on public.checklist_items to authenticated;
grant select, insert, update on public.checklist_runs to authenticated;
grant select, insert, update, delete on public.checklist_answers to authenticated;
grant select, insert, delete on public.checklist_answer_evidences to authenticated;

alter table public.checklist_templates enable row level security;
alter table public.checklist_items enable row level security;
alter table public.checklist_runs enable row level security;
alter table public.checklist_answers enable row level security;
alter table public.checklist_answer_evidences enable row level security;

create or replace function private.checklist_run_scope_ok(p_run uuid, p_manage boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.checklist_runs r where r.id = p_run
      and case when p_manage then private.can_manage_scope(r.program_id, r.team_id)
               else private.can_read_scope(r.program_id, r.team_id) end
  )
$$;
create or replace function private.checklist_answer_scope_ok(p_answer uuid, p_manage boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.checklist_answers a where a.id = p_answer and private.checklist_run_scope_ok(a.run_id, p_manage))
$$;
grant execute on function private.checklist_run_scope_ok(uuid, boolean), private.checklist_answer_scope_ok(uuid, boolean) to authenticated;

-- Modelos: membros do programa leem (orientadores aplicam); supervisão define.
create policy checklist_templates_select on public.checklist_templates for select to authenticated
  using (private.is_program_member(program_id));
create policy checklist_templates_insert on public.checklist_templates for insert to authenticated
  with check (private.has_program_role(program_id, '{supervisao}'));
create policy checklist_templates_update on public.checklist_templates for update to authenticated
  using (private.has_program_role(program_id, '{supervisao}'))
  with check (private.has_program_role(program_id, '{supervisao}'));

create policy checklist_items_select on public.checklist_items for select to authenticated
  using (private.is_program_member(program_id));
create policy checklist_items_insert on public.checklist_items for insert to authenticated
  with check (private.has_program_role(program_id, '{supervisao}'));
create policy checklist_items_update on public.checklist_items for update to authenticated
  using (private.has_program_role(program_id, '{supervisao}'))
  with check (private.has_program_role(program_id, '{supervisao}'));
create policy checklist_items_delete on public.checklist_items for delete to authenticated
  using (private.has_program_role(program_id, '{supervisao}'));

create policy checklist_runs_select on public.checklist_runs for select to authenticated
  using (private.can_read_scope(program_id, team_id));
create policy checklist_runs_insert on public.checklist_runs for insert to authenticated
  with check (private.can_manage_scope(program_id, team_id));
create policy checklist_runs_update on public.checklist_runs for update to authenticated
  using (private.can_manage_scope(program_id, team_id))
  with check (private.can_manage_scope(program_id, team_id));

create policy checklist_answers_select on public.checklist_answers for select to authenticated
  using (private.checklist_run_scope_ok(run_id, false));
create policy checklist_answers_insert on public.checklist_answers for insert to authenticated
  with check (answered_by = auth.uid() and private.checklist_run_scope_ok(run_id, true));
create policy checklist_answers_update on public.checklist_answers for update to authenticated
  using (private.checklist_run_scope_ok(run_id, true)) with check (private.checklist_run_scope_ok(run_id, true));
create policy checklist_answers_delete on public.checklist_answers for delete to authenticated
  using (private.checklist_run_scope_ok(run_id, true));

create policy checklist_answer_evidences_select on public.checklist_answer_evidences for select to authenticated
  using (private.checklist_answer_scope_ok(answer_id, false));
create policy checklist_answer_evidences_insert on public.checklist_answer_evidences for insert to authenticated
  with check (
    created_by = auth.uid()
    and private.checklist_answer_scope_ok(answer_id, true)
    and private.can_read_document(document_id)
  );
create policy checklist_answer_evidences_delete on public.checklist_answer_evidences for delete to authenticated
  using (private.checklist_answer_scope_ok(answer_id, true));

-- >>>>> supabase/migrations/20261124000700_auditoria_alertas.sql
-- =============================================================================
-- COMPETE VIX — 0700 Auditoria (RF15) e notificações/alertas (PRD §9)
-- audit_log: ator, entidade, operação, instante e diff minimizado (sem valores
-- de campos pessoais). notifications: uma por entidade/período/regra (dedupe_key),
-- resolvida automaticamente quando a condição cessa. Sem envio externo no MVP.
-- =============================================================================

create table public.audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor uuid,
  table_name text not null,
  record_id uuid,
  program_id uuid,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  changed jsonb
);
create index audit_log_program_idx on public.audit_log (program_id, occurred_at desc);
create index audit_log_table_idx on public.audit_log (table_name, occurred_at desc);

-- Campos cujo VALOR não vai para o log (registra-se só que mudaram)
create or replace function private.audit_masked_columns() returns text[]
language sql immutable set search_path = '' as $$
  select array['email', 'full_name', 'display_name', 'note', 'notes', 'description', 'settings']
$$;

create or replace function private.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_changed jsonb := '{}'::jsonb;
  v_key text;
  v_program uuid;
begin
  for v_key in select jsonb_object_keys(v_row) loop
    continue when v_key in ('updated_at', 'created_at');
    if tg_op = 'UPDATE' and (v_new -> v_key) is not distinct from (v_old -> v_key) then
      continue;
    end if;
    if v_key = any (private.audit_masked_columns()) then
      v_changed := v_changed || jsonb_build_object(v_key, '«alterado»');
    elsif tg_op = 'UPDATE' then
      v_changed := v_changed || jsonb_build_object(v_key, jsonb_build_array(v_old -> v_key, v_new -> v_key));
    else
      v_changed := v_changed || jsonb_build_object(v_key, v_row -> v_key);
    end if;
  end loop;

  if tg_op = 'UPDATE' and v_changed = '{}'::jsonb then
    return null;
  end if;

  v_program := case
    when tg_table_name = 'programs' then (v_row ->> 'id')::uuid
    when v_row ? 'program_id' then (v_row ->> 'program_id')::uuid
  end;

  insert into public.audit_log (actor, table_name, record_id, program_id, operation, changed)
  values (auth.uid(), tg_table_name, (v_row ->> 'id')::uuid, v_program, tg_op, v_changed);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'units', 'competitions', 'cycles', 'programs', 'stages', 'occupations', 'memberships',
    'profiles', 'people', 'teams', 'team_members', 'checklist_templates', 'documents', 'events'
  ] loop
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each row execute function private.audit()', t || '_audit', t);
  end loop;
end $$;

-- platform_admins usa user_id como chave
create or replace function private.audit_admins() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (actor, table_name, record_id, operation, changed)
  values (auth.uid(), 'platform_admins', coalesce(new.user_id, old.user_id), tg_op, '{}'::jsonb);
  return null;
end $$;
create trigger platform_admins_audit after insert or delete on public.platform_admins
  for each row execute function private.audit_admins();

grant select on public.audit_log to authenticated;
alter table public.audit_log enable row level security;
-- Administradores: trilha de configuração (sem programa) e vínculos;
-- Supervisão: trilha do próprio programa.
create policy audit_log_select on public.audit_log for select to authenticated using (
  (private.is_admin() and (program_id is null or table_name in ('memberships', 'programs')))
  or (program_id is not null and private.has_program_role(program_id, '{supervisao}'))
);

-- ---------------------------------------------------------------------------
-- Notificações
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  program_id uuid references public.programs (id),
  rule text not null check (rule in ('acao_vencida', 'checklist_pendente')),
  entity_table text not null,
  entity_id uuid not null,
  period_key text not null,
  title text not null,
  link text,
  dedupe_key text not null unique,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  resolved_at timestamptz
);
create index notifications_user_idx on public.notifications (user_id, created_at desc) where resolved_at is null;

grant select, update on public.notifications to authenticated;
alter table public.notifications enable row level security;
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Usuário só marca como lida; demais campos imutáveis
create or replace function private.notifications_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null and (new.user_id, new.rule, new.entity_id, new.dedupe_key, new.title, new.resolved_at)
     is distinct from (old.user_id, old.rule, old.entity_id, old.dedupe_key, old.title, old.resolved_at) then
    raise exception 'Somente a leitura da notificação pode ser alterada.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger notifications_guard before update on public.notifications
  for each row execute function private.notifications_guard();

-- Destinatários: supervisão vigente do programa + usuário do responsável (se houver)
create or replace function private.program_supervisors(p_program uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct m.user_id
  from public.programs pr
  join public.memberships m on (m.program_id = pr.id or m.unit_id = pr.unit_id)
  join public.profiles p on p.id = m.user_id and p.active
  where pr.id = p_program and m.role = 'supervisao' and m.revoked_at is null
    and m.valid_from <= private.today() and (m.valid_to is null or m.valid_to >= private.today())
$$;

-- Gera/resolve alertas de forma idempotente. Executada por rotina agendada (service role).
create or replace function public.refresh_alerts()
returns table (created integer, resolved integer)
language plpgsql security definer set search_path = '' as $$
declare v_created int := 0; v_resolved int := 0; v_n int;
begin
  -- Ações vencidas
  insert into public.notifications (user_id, program_id, rule, entity_table, entity_id, period_key, title, link, dedupe_key)
  select r.user_id, a.program_id, 'acao_vencida', 'actions', a.id, a.due_date::text,
         'Ação vencida: ' || a.title, '/acoes/' || a.id,
         'acao_vencida:' || a.id || ':' || a.due_date || ':' || r.user_id
  from public.actions a
  cross join lateral (
    select s as user_id from private.program_supervisors(a.program_id) s
    union
    select pe.user_id from public.people pe where pe.id = a.owner_person_id and pe.user_id is not null
  ) r
  where a.archived_at is null and a.due_date < private.today() and a.status not in ('concluida', 'cancelada')
  on conflict (dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_created := v_created + v_n;

  -- Checklists com período encerrado e não concluídos
  insert into public.notifications (user_id, program_id, rule, entity_table, entity_id, period_key, title, link, dedupe_key)
  select s, r.program_id, 'checklist_pendente', 'checklist_runs', r.id, r.period_start::text,
         'Checklist pendente: ' || t.name || ' (' || to_char(r.period_start, 'DD/MM') || ')',
         '/checklists/' || r.id,
         'checklist_pendente:' || r.id || ':' || s
  from public.checklist_runs r
  join public.checklist_templates t on t.id = r.template_id
  cross join lateral private.program_supervisors(r.program_id) s
  where r.status = 'aberto' and r.period_end < private.today()
  on conflict (dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_created := v_created + v_n;

  -- Resolver quando a condição cessa
  update public.notifications n set resolved_at = now()
  where n.resolved_at is null and n.rule = 'acao_vencida'
    and not exists (
      select 1 from public.actions a where a.id = n.entity_id and a.archived_at is null
        and a.due_date < private.today() and a.status not in ('concluida', 'cancelada')
        and a.due_date::text = n.period_key
    );
  get diagnostics v_n = row_count; v_resolved := v_resolved + v_n;

  update public.notifications n set resolved_at = now()
  where n.resolved_at is null and n.rule = 'checklist_pendente'
    and not exists (select 1 from public.checklist_runs r where r.id = n.entity_id and r.status = 'aberto');
  get diagnostics v_n = row_count; v_resolved := v_resolved + v_n;

  return query select v_created, v_resolved;
end $$;
revoke execute on function public.refresh_alerts() from public, anon, authenticated;
grant execute on function public.refresh_alerts() to service_role;

-- >>>>> supabase/migrations/20261124000800_vinculo_pessoa_usuario.sql
-- =============================================================================
-- COMPETE VIX — 0800 Vínculo pessoa ↔ usuário (login)
-- A administração cria usuários e vínculos de acesso, mas não lê o cadastro de
-- pessoas (PRD §4: sem acesso automático a dados sensíveis). A supervisão da
-- unidade, que lê as pessoas, vincula a pessoa ao login informando o e-mail.
-- Só é aceito usuário que já tenha vínculo vigente com algum programa da unidade,
-- evitando enumerar contas de terceiros.
-- =============================================================================

create or replace function public.link_person_to_user(p_person uuid, p_email text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_unit uuid;
  v_user uuid;
begin
  select pe.unit_id into v_unit from public.people pe where pe.id = p_person;
  if v_unit is null or not private.supervises_unit(v_unit) then
    raise exception 'Pessoa não encontrada no seu escopo.' using errcode = 'insufficient_privilege';
  end if;

  if p_email is null or btrim(p_email) = '' then
    update public.people set user_id = null where id = p_person;
    return 'Vínculo com login removido.';
  end if;

  select u.id into v_user
  from auth.users u
  join public.profiles p on p.id = u.id and p.active
  where lower(u.email) = lower(btrim(p_email))
    and exists (
      select 1 from public.memberships m
      left join public.programs pr on pr.id = m.program_id
      where m.user_id = u.id and m.revoked_at is null
        and (m.valid_to is null or m.valid_to >= private.today())
        and (pr.unit_id = v_unit or m.unit_id = v_unit)
    );
  if v_user is null then
    raise exception 'Nenhum usuário ativo com esse e-mail e vínculo nesta unidade. Peça à administração o convite e o vínculo.'
      using errcode = 'check_violation';
  end if;

  update public.people set user_id = v_user where id = p_person;
  return 'Pessoa vinculada ao login.';
end $$;

revoke execute on function public.link_person_to_user(uuid, text) from public, anon;
grant execute on function public.link_person_to_user(uuid, text) to authenticated;

-- >>>>> supabase/migrations/20261124000900_endurecimento.sql
-- =============================================================================
-- COMPETE VIX — 0900 Endurecimento de privilégios (defesa em profundidade)
-- No Supabase, privilégios padrão concedem acesso de tabela ao papel `anon`.
-- O RLS já nega tudo a `anon`; aqui também removemos o privilégio de tabela,
-- inclusive para objetos criados futuramente.
-- =============================================================================
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;
revoke all on schema private from anon;

-- >>>>> supabase/seed/references.sql
-- =============================================================================
-- SEED DE REFERÊNCIAS — somente dados identificados no PRD v0.1 (24/11/2026).
-- Não contém pessoas, usuários, notas ou datas inventadas. Idempotente.
-- Fontes: infográficos da gestão e reunião de 24/11/2026 (PRD §1, §6, §7).
-- Itens marcados "validar" dependem de confirmação institucional (PRD §14).
-- =============================================================================

insert into public.units (code, name) values
  ('BEIRA-MAR', 'SENAI Vitória — Beira-Mar'),
  ('PORTO', 'SENAI Vitória — Porto')
on conflict (code) do nothing;

insert into public.competitions (code, name, kind, description) values
  ('WORLDSKILLS', 'WorldSkills', 'worldskills', 'Prioridade do MVP (PRD §2).'),
  ('INOVA', 'INOVA SENAI', 'inova', 'Prioridade do MVP (PRD §2).'),
  ('FRC', 'FIRST Robotics Competition (FRC)', 'frc', 'Cadastrável com módulos comuns; levantamento específico na etapa 5.'),
  ('GIAFFONE', 'Giaffone', 'giaffone', 'Cadastrável com módulos comuns; levantamento específico na etapa 5.'),
  ('E-KART', 'E-Kart', 'ekart', 'Cadastrável com módulos comuns; levantamento específico na etapa 5.')
on conflict (code) do nothing;

-- Ciclo das metas 2027. Datas oficiais não informadas no PRD: permanecem vazias.
insert into public.cycles (code, name) values ('2027', 'Ciclo 2027')
on conflict (code) do nothing;

-- Programas com evidência no PRD:
--   WorldSkills Beira-Mar (#33, #48), WorldSkills Porto (#50), INOVA Beira-Mar (Digital Twin, base 2026)
insert into public.programs (competition_id, cycle_id, unit_id, status)
select c.id, cy.id, u.id, 'planejamento'
from (values ('WORLDSKILLS', 'BEIRA-MAR'), ('WORLDSKILLS', 'PORTO'), ('INOVA', 'BEIRA-MAR')) v(comp, unit)
join public.competitions c on c.code = v.comp
join public.units u on u.code = v.unit
join public.cycles cy on cy.code = '2027'
on conflict (competition_id, cycle_id, unit_id) do nothing;

-- Ocupações e metas (PRD §6 — fonte: infográfico; validar edição e comparabilidade)
insert into public.occupations (program_id, code, name, target_score, target_source)
select p.id, v.code, v.name, v.target, 'Infográfico da gestão (PRD v0.1 §6) — meta proposta; validar com supervisão'
from (values
  ('BEIRA-MAR', '#33', 'Tecnologia Automotiva', 760),
  ('BEIRA-MAR', '#48', 'Indústria 4.0', 750),
  ('PORTO', '#50', 'Arte Digital 3D', 770)
) v(unit, code, name, target)
join public.units u on u.code = v.unit
join public.competitions c on c.code = 'WORLDSKILLS'
join public.cycles cy on cy.code = '2027'
join public.programs p on p.competition_id = c.id and p.cycle_id = cy.id and p.unit_id = u.id
on conflict (program_id, code) do nothing;

commit;
