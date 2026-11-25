-- =============================================================================
-- COMPETE VIX — INSTALAÇÃO COMPLETA DO BANCO (gerado por scripts/bundle-sql.sh)
-- Execute UMA ÚNICA VEZ, num projeto Supabase NOVO. Inclui as referências do PRD (sem dados de demonstração).
-- Tudo roda numa transação: se algo falhar, nada é aplicado.
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

-- >>>>> supabase/migrations/20261125000100_worldskills.sql
-- =============================================================================
-- COMPETE VIX — 1000 Etapa 2: WorldSkills (RF07) e acompanhamento semanal (RF06)
-- PRD §6, §8, §9. Alocação com jornada e percentual por pessoa e vigência;
-- competências; plano versionado; sessões e presença individual; simulados com
-- escala explícita, erros e causa raiz; rampa mensal; fechamento semanal revisado.
-- Regras de cálculo (CH, execução, desvio) ficam no domínio (TypeScript, testado).
-- =============================================================================

create type public.score_scale as enum ('worldskills', 'percentual', 'pontos_brutos');
create type public.training_plan_status as enum ('rascunho', 'publicado', 'substituido');
create type public.training_item_status as enum ('previsto', 'concluido', 'cancelado');
create type public.attendance_status as enum ('presente', 'parcial', 'ausente', 'justificada');
create type public.assessment_type as enum ('parcial', 'completo', 'externo', 'diagnostico');
create type public.assessment_status as enum ('rascunho', 'publicado');
create type public.error_action_status as enum ('aberta', 'em_andamento', 'concluida');
create type public.target_status as enum ('proposta', 'aprovada');
create type public.weekly_report_status as enum ('rascunho', 'enviado', 'em_revisao', 'aprovado', 'devolvido');

-- Escala da meta da ocupação (as metas 760/750/770 do PRD estão na escala WorldSkills)
alter table public.occupations add column target_scale public.score_scale not null default 'worldskills';

-- ---------------------------------------------------------------------------
-- Alocações: jornada-base semanal × percentual dedicado, por vigência
-- ---------------------------------------------------------------------------
create table public.allocations (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id),
  team_id uuid,
  person_id uuid not null references public.people (id),
  base_weekly_minutes integer not null check (base_weekly_minutes between 60 and 4200),
  percent numeric(5,2) not null default 100 check (percent > 0 and percent <= 100),
  planned_weekly_minutes integer generated always as (round(base_weekly_minutes * percent / 100)::integer) stored,
  valid_from date not null,
  valid_to date,
  note text check (length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  constraint allocations_team_fk foreign key (team_id, program_id) references public.teams (id, program_id),
  constraint allocations_validity_ck check (valid_to is null or valid_to >= valid_from)
);
create index allocations_program_idx on public.allocations (program_id);
create index allocations_person_idx on public.allocations (person_id);
create index allocations_team_idx on public.allocations (team_id);
alter table public.allocations add constraint allocations_no_overlap
  exclude using gist (
    person_id with =, program_id with =, (coalesce(team_id, '00000000-0000-0000-0000-000000000000'::uuid)) with =,
    daterange(valid_from, coalesce(valid_to, 'infinity'::date), '[]') with &&
  );

-- ---------------------------------------------------------------------------
-- Competências por ocupação (pesos só após validação dos documentos oficiais)
-- ---------------------------------------------------------------------------
create table public.competencies (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null,
  occupation_id uuid not null,
  name text not null check (length(btrim(name)) between 2 and 160),
  weight numeric(6,2) check (weight >= 0),
  weight_source text check (length(weight_source) <= 300),
  position smallint not null default 0 check (position >= 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  constraint competencies_occupation_fk foreign key (occupation_id, program_id) references public.occupations (id, program_id),
  constraint competencies_scope_uk unique (id, program_id),
  constraint competencies_name_uk unique (occupation_id, name),
  constraint competencies_weight_source_ck check (weight is null or weight_source is not null)
);
create index competencies_occupation_idx on public.competencies (occupation_id);

-- ---------------------------------------------------------------------------
-- Plano de treinamento versionado por equipe
-- ---------------------------------------------------------------------------
create table public.training_plans (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null,
  team_id uuid not null,
  family_id uuid not null default gen_random_uuid(),
  version integer not null default 1 check (version >= 1),
  title text not null check (length(btrim(title)) between 3 and 160),
  period_start date not null,
  period_end date not null,
  status public.training_plan_status not null default 'rascunho',
  change_note text check (length(change_note) <= 2000),
  published_at timestamptz,
  published_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  constraint training_plans_team_fk foreign key (team_id, program_id) references public.teams (id, program_id),
  constraint training_plans_scope_uk unique (id, program_id),
  constraint training_plans_version_uk unique (family_id, version),
  constraint training_plans_period_ck check (period_end >= period_start)
);
create index training_plans_team_idx on public.training_plans (team_id);

create table public.training_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null,
  program_id uuid not null,
  competency_id uuid,
  objective text not null check (length(btrim(objective)) between 3 and 500),
  activity text not null check (length(btrim(activity)) between 3 and 1000),
  planned_minutes integer not null check (planned_minutes > 0 and planned_minutes <= 20000),
  responsible_person_id uuid references public.people (id),
  resource text check (length(resource) <= 500),
  expected_evidence text check (length(expected_evidence) <= 500),
  acceptance_criteria text check (length(acceptance_criteria) <= 1000),
  due_date date not null,
  status public.training_item_status not null default 'previsto',
  status_note text check (length(status_note) <= 1000),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  constraint training_items_plan_fk foreign key (plan_id, program_id) references public.training_plans (id, program_id) on delete cascade,
  constraint training_items_competency_fk foreign key (competency_id, program_id) references public.competencies (id, program_id),
  constraint training_items_scope_uk unique (id, program_id)
);
create index training_items_plan_idx on public.training_items (plan_id, due_date);

-- ---------------------------------------------------------------------------
-- Sessões de treino e presença individual
-- ---------------------------------------------------------------------------
create table public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null,
  team_id uuid not null,
  training_item_id uuid,
  competency_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- Duração efetiva (descontadas pausas); presença individual não pode superá-la
  actual_minutes integer not null check (actual_minutes > 0),
  location text check (length(location) <= 200),
  notes text check (length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  constraint training_sessions_team_fk foreign key (team_id, program_id) references public.teams (id, program_id),
  constraint training_sessions_item_fk foreign key (training_item_id, program_id) references public.training_items (id, program_id),
  constraint training_sessions_competency_fk foreign key (competency_id, program_id) references public.competencies (id, program_id),
  constraint training_sessions_scope_uk unique (id, program_id),
  constraint training_sessions_time_ck check (ends_at > starts_at and ends_at - starts_at <= interval '16 hours'),
  constraint training_sessions_actual_ck check (actual_minutes * interval '1 minute' <= ends_at - starts_at)
);
create index training_sessions_team_time_idx on public.training_sessions (team_id, starts_at);
create index training_sessions_program_time_idx on public.training_sessions (program_id, starts_at);

create table public.attendance (
  session_id uuid not null,
  program_id uuid not null,
  person_id uuid not null references public.people (id),
  status public.attendance_status not null,
  attended_minutes integer not null check (attended_minutes >= 0),
  justification text check (length(justification) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  primary key (session_id, person_id),
  constraint attendance_session_fk foreign key (session_id, program_id) references public.training_sessions (id, program_id) on delete cascade,
  constraint attendance_status_ck check (
    (status in ('ausente', 'justificada') and attended_minutes = 0)
    or (status in ('presente', 'parcial') and attended_minutes > 0)
  ),
  constraint attendance_justification_ck check (status <> 'justificada' or justification is not null)
);
create index attendance_person_idx on public.attendance (person_id);

-- ---------------------------------------------------------------------------
-- Simulados, resultados e análise de erros
-- ---------------------------------------------------------------------------
create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null,
  team_id uuid not null,
  occupation_id uuid,
  type public.assessment_type not null,
  title text not null check (length(btrim(title)) between 3 and 160),
  test_version text check (length(test_version) <= 60),
  criteria_version text check (length(criteria_version) <= 60),
  held_on date not null,
  scale public.score_scale not null,
  scale_max numeric(8,2) not null check (scale_max > 0),
  planned_minutes integer check (planned_minutes > 0),
  actual_minutes integer check (actual_minutes > 0),
  status public.assessment_status not null default 'rascunho',
  review_note text check (length(review_note) <= 2000),
  published_at timestamptz,
  published_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  constraint assessments_team_fk foreign key (team_id, program_id) references public.teams (id, program_id),
  constraint assessments_occupation_fk foreign key (occupation_id, program_id) references public.occupations (id, program_id),
  constraint assessments_scope_uk unique (id, program_id)
);
create index assessments_team_idx on public.assessments (team_id, held_on);

create table public.assessment_results (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null,
  program_id uuid not null,
  -- null = resultado da equipe; preenchido = resultado individual
  person_id uuid references public.people (id),
  criterion text check (length(criterion) <= 160),
  score numeric(8,2) not null check (score >= 0),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  constraint assessment_results_fk foreign key (assessment_id, program_id) references public.assessments (id, program_id) on delete cascade,
  constraint assessment_results_uk unique nulls not distinct (assessment_id, person_id, criterion)
);

create table public.assessment_errors (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null,
  program_id uuid not null,
  competency_id uuid,
  description text not null check (length(btrim(description)) between 3 and 1000),
  root_cause text check (length(root_cause) <= 1000),
  corrective_action text check (length(corrective_action) <= 1000),
  owner_person_id uuid references public.people (id),
  due_date date,
  status public.error_action_status not null default 'aberta',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  constraint assessment_errors_fk foreign key (assessment_id, program_id) references public.assessments (id, program_id) on delete cascade,
  constraint assessment_errors_competency_fk foreign key (competency_id, program_id) references public.competencies (id, program_id),
  constraint assessment_errors_closed_ck check (status <> 'concluida' or (root_cause is not null and corrective_action is not null))
);
create index assessment_errors_assessment_idx on public.assessment_errors (assessment_id);

-- ---------------------------------------------------------------------------
-- Rampa de pontuação mensal (pontos intermediários ainda não aprovados: status)
-- ---------------------------------------------------------------------------
create table public.score_targets (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null,
  occupation_id uuid not null,
  month date not null check (extract(day from month) = 1),
  target numeric(8,2) not null check (target >= 0),
  scale public.score_scale not null default 'worldskills',
  status public.target_status not null default 'proposta',
  source text not null check (length(btrim(source)) between 3 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  constraint score_targets_occupation_fk foreign key (occupation_id, program_id) references public.occupations (id, program_id),
  constraint score_targets_uk unique (occupation_id, month, scale)
);

-- ---------------------------------------------------------------------------
-- Fechamento semanal por equipe (RF06): rascunho → enviado → em revisão → aprovado/devolvido
-- ---------------------------------------------------------------------------
create table public.weekly_reports (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null,
  team_id uuid not null,
  week_start date not null check (extract(isodow from week_start) = 1),
  version integer not null default 1 check (version >= 1),
  supersedes_id uuid,
  planned_minutes integer not null default 0 check (planned_minutes >= 0),
  actual_minutes integer not null default 0 check (actual_minutes >= 0),
  outcomes text check (length(outcomes) <= 4000),
  blockers text check (length(blockers) <= 4000),
  intervention text check (length(intervention) <= 4000),
  next_steps text check (length(next_steps) <= 4000),
  status public.weekly_report_status not null default 'rascunho',
  submitted_at timestamptz,
  submitted_by uuid references public.profiles (id),
  review_note text check (length(review_note) <= 2000),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  constraint weekly_reports_team_fk foreign key (team_id, program_id) references public.teams (id, program_id),
  constraint weekly_reports_scope_uk unique (id, program_id),
  constraint weekly_reports_supersedes_fk foreign key (supersedes_id, program_id) references public.weekly_reports (id, program_id),
  constraint weekly_reports_version_uk unique (team_id, week_start, version)
);
create index weekly_reports_program_week_idx on public.weekly_reports (program_id, week_start);

-- updated_at
create trigger allocations_touch before update on public.allocations for each row execute function private.touch_updated_at();
create trigger competencies_touch before update on public.competencies for each row execute function private.touch_updated_at();
create trigger training_plans_touch before update on public.training_plans for each row execute function private.touch_updated_at();
create trigger training_items_touch before update on public.training_items for each row execute function private.touch_updated_at();
create trigger training_sessions_touch before update on public.training_sessions for each row execute function private.touch_updated_at();
create trigger attendance_touch before update on public.attendance for each row execute function private.touch_updated_at();
create trigger assessments_touch before update on public.assessments for each row execute function private.touch_updated_at();
create trigger assessment_errors_touch before update on public.assessment_errors for each row execute function private.touch_updated_at();
create trigger score_targets_touch before update on public.score_targets for each row execute function private.touch_updated_at();
create trigger weekly_reports_touch before update on public.weekly_reports for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Regras de integridade
-- ---------------------------------------------------------------------------
-- Coluna de pessoa passada como argumento do gatilho (tabelas diferentes, colunas diferentes)
create or replace function private.people_ref_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_person_visible((to_jsonb(new) ->> tg_argv[0])::uuid);
  return new;
end $$;
create trigger allocations_people_guard before insert or update on public.allocations for each row execute function private.people_ref_guard('person_id');
create trigger attendance_people_guard before insert or update on public.attendance for each row execute function private.people_ref_guard('person_id');
create trigger assessment_results_people_guard before insert or update on public.assessment_results for each row execute function private.people_ref_guard('person_id');
create trigger training_items_people_guard before insert or update on public.training_items for each row execute function private.people_ref_guard('responsible_person_id');
create trigger assessment_errors_people_guard before insert or update on public.assessment_errors for each row execute function private.people_ref_guard('owner_person_id');

-- Competência precisa ser da ocupação da equipe (quando a equipe tem ocupação)
create or replace function private.competency_matches_team(p_competency uuid, p_team uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_competency is null or exists (
    select 1 from public.competencies c join public.teams t on t.id = p_team
    where c.id = p_competency and (t.occupation_id is null or t.occupation_id = c.occupation_id)
  )
$$;

-- Plano: publicado/substituído é imutável (exceto execução dos itens)
create or replace function private.training_plans_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if old.status <> 'rascunho' and (new.title, new.period_start, new.period_end, new.team_id, new.family_id, new.version, new.program_id)
       is distinct from (old.title, old.period_start, old.period_end, old.team_id, old.family_id, old.version, old.program_id) then
      raise exception 'Plano publicado é imutável; crie uma nova versão.' using errcode = 'check_violation';
    end if;
    if old.status = 'substituido' and new.status <> 'substituido' then
      raise exception 'Versão substituída não volta a ser publicada.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
create trigger training_plans_guard before insert or update on public.training_plans
  for each row execute function private.training_plans_guard();

create or replace function private.training_items_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_status public.training_plan_status; v_team uuid;
begin
  select p.status, p.team_id into v_status, v_team from public.training_plans p where p.id = coalesce(new.plan_id, old.plan_id);
  if tg_op = 'DELETE' then
    if v_status <> 'rascunho' then raise exception 'Itens de plano publicado não podem ser excluídos; crie nova versão.' using errcode = 'check_violation'; end if;
    return old;
  end if;
  if not private.competency_matches_team(new.competency_id, v_team) then
    raise exception 'A competência não pertence à ocupação da equipe.' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' then
    if v_status <> 'rascunho' then raise exception 'Inclua itens apenas em rascunho.' using errcode = 'check_violation'; end if;
    if new.status <> 'previsto' then raise exception 'Item começa como previsto.' using errcode = 'check_violation'; end if;
    return new;
  end if;
  -- UPDATE: em plano publicado, só a execução (status/nota) pode mudar
  if v_status <> 'rascunho' and (new.objective, new.activity, new.planned_minutes, new.competency_id, new.due_date, new.responsible_person_id, new.resource, new.expected_evidence, new.acceptance_criteria)
     is distinct from (old.objective, old.activity, old.planned_minutes, old.competency_id, old.due_date, old.responsible_person_id, old.resource, old.expected_evidence, old.acceptance_criteria) then
    raise exception 'Plano publicado: altere o conteúdo em uma nova versão.' using errcode = 'check_violation';
  end if;
  if v_status = 'substituido' and new.status is distinct from old.status then
    raise exception 'Versão substituída não recebe registro de execução.' using errcode = 'check_violation';
  end if;
  if v_status = 'rascunho' and new.status <> 'previsto' then
    raise exception 'Execução só é registrada após publicar o plano.' using errcode = 'check_violation';
  end if;
  if new.status = 'cancelado' and nullif(btrim(new.status_note), '') is null then
    raise exception 'Cancelamento de item exige justificativa.' using errcode = 'check_violation';
  end if;
  new.completed_at := case when new.status = 'concluido' then coalesce(old.completed_at, now()) else null end;
  return new;
end $$;
create trigger training_items_guard before insert or update or delete on public.training_items
  for each row execute function private.training_items_guard();

create or replace function private.training_sessions_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not private.competency_matches_team(new.competency_id, new.team_id) then
    raise exception 'A competência não pertence à ocupação da equipe.' using errcode = 'check_violation';
  end if;
  if new.training_item_id is not null and not exists (
    select 1 from public.training_items i join public.training_plans p on p.id = i.plan_id
    where i.id = new.training_item_id and p.team_id = new.team_id and p.status <> 'rascunho'
  ) then
    raise exception 'O item vinculado deve ser de um plano publicado desta equipe.' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and exists (
    select 1 from public.attendance a where a.session_id = new.id and a.attended_minutes > new.actual_minutes
  ) then
    raise exception 'Há presenças maiores que a nova duração efetiva.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger training_sessions_guard before insert or update on public.training_sessions
  for each row execute function private.training_sessions_guard();

create or replace function private.attendance_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_actual int;
begin
  select s.actual_minutes into v_actual from public.training_sessions s where s.id = new.session_id;
  if new.attended_minutes > v_actual then
    raise exception 'Presença (% min) maior que a duração efetiva da sessão (% min).', new.attended_minutes, v_actual using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger attendance_guard before insert or update on public.attendance
  for each row execute function private.attendance_guard();

-- Simulado publicado: nota e escala congeladas; notas dentro do limite da escala
create or replace function private.assessments_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.status = 'publicado' and
     (new.scale, new.scale_max, new.held_on, new.type, new.team_id, new.occupation_id, new.test_version, new.criteria_version, new.status)
     is distinct from (old.scale, old.scale_max, old.held_on, old.type, old.team_id, old.occupation_id, old.test_version, old.criteria_version, old.status) then
    raise exception 'Simulado publicado é imutável; registre a revisão no campo próprio.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger assessments_guard before update on public.assessments for each row execute function private.assessments_guard();

create or replace function private.assessment_results_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_a public.assessments;
begin
  select * into v_a from public.assessments a where a.id = coalesce(new.assessment_id, old.assessment_id);
  if v_a.status = 'publicado' then
    raise exception 'Simulado publicado: notas não podem ser alteradas.' using errcode = 'check_violation';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if new.score > v_a.scale_max then
    raise exception 'Nota % acima do máximo da escala (%).', new.score, v_a.scale_max using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger assessment_results_guard before insert or update or delete on public.assessment_results
  for each row execute function private.assessment_results_guard();

-- Relatório semanal: conteúdo editável só em rascunho/devolvido; status via RPC
create or replace function private.weekly_reports_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'rascunho' then raise exception 'Relatório começa em rascunho.' using errcode = 'check_violation'; end if;
    return new;
  end if;
  if (new.team_id, new.week_start, new.version, new.program_id) is distinct from (old.team_id, old.week_start, old.version, old.program_id) then
    raise exception 'Equipe, semana e versão são imutáveis.' using errcode = 'check_violation';
  end if;
  if new.status is distinct from old.status and current_setting('app.weekly_report_flow', true) is distinct from 'on' then
    raise exception 'Use o fluxo de envio/revisão para mudar o status.' using errcode = 'check_violation';
  end if;
  if old.status not in ('rascunho', 'devolvido')
     and (new.planned_minutes, new.actual_minutes, new.outcomes, new.blockers, new.intervention, new.next_steps)
     is distinct from (old.planned_minutes, old.actual_minutes, old.outcomes, old.blockers, old.intervention, old.next_steps) then
    raise exception 'Relatório enviado ou aprovado não pode ser editado; após aprovação, crie uma correção (nova versão).' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger weekly_reports_guard before insert or update on public.weekly_reports
  for each row execute function private.weekly_reports_guard();

-- ---------------------------------------------------------------------------
-- Operações transacionais
-- ---------------------------------------------------------------------------
create or replace function public.publish_training_plan(p_plan uuid)
returns public.training_plans language plpgsql security invoker set search_path = '' as $$
declare v public.training_plans;
begin
  select * into v from public.training_plans where id = p_plan for update;
  if v.id is null then raise exception 'Plano não encontrado.' using errcode = 'insufficient_privilege'; end if;
  if v.status <> 'rascunho' then raise exception 'Apenas rascunhos podem ser publicados.' using errcode = 'check_violation'; end if;
  if not exists (select 1 from public.training_items i where i.plan_id = v.id) then
    raise exception 'Inclua ao menos um item antes de publicar.' using errcode = 'check_violation';
  end if;
  update public.training_plans set status = 'substituido' where family_id = v.family_id and status = 'publicado' and id <> v.id;
  update public.training_plans set status = 'publicado', published_at = now(), published_by = auth.uid() where id = v.id returning * into v;
  return v;
end $$;

create or replace function public.new_training_plan_version(p_plan uuid, p_note text)
returns public.training_plans language plpgsql security invoker set search_path = '' as $$
declare v_src public.training_plans; v_new public.training_plans;
begin
  if nullif(btrim(p_note), '') is null then
    raise exception 'Descreva o motivo da alteração do plano.' using errcode = 'check_violation';
  end if;
  select * into v_src from public.training_plans where id = p_plan;
  if v_src.id is null then raise exception 'Plano não encontrado.' using errcode = 'insufficient_privilege'; end if;
  if exists (select 1 from public.training_plans where family_id = v_src.family_id and status = 'rascunho') then
    raise exception 'Já existe um rascunho desta família.' using errcode = 'check_violation';
  end if;
  insert into public.training_plans (program_id, team_id, family_id, version, title, period_start, period_end, change_note)
  select v_src.program_id, v_src.team_id, v_src.family_id, max(version) + 1, v_src.title, v_src.period_start, v_src.period_end, btrim(p_note)
  from public.training_plans where family_id = v_src.family_id
  returning * into v_new;
  insert into public.training_items (plan_id, program_id, competency_id, objective, activity, planned_minutes,
    responsible_person_id, resource, expected_evidence, acceptance_criteria, due_date)
  select v_new.id, v_new.program_id, i.competency_id, i.objective, i.activity, i.planned_minutes,
    i.responsible_person_id, i.resource, i.expected_evidence, i.acceptance_criteria, i.due_date
  from public.training_items i where i.plan_id = v_src.id and i.status <> 'cancelado';
  return v_new;
end $$;

create or replace function public.publish_assessment(p_assessment uuid)
returns public.assessments language plpgsql security invoker set search_path = '' as $$
declare v public.assessments;
begin
  select * into v from public.assessments where id = p_assessment for update;
  if v.id is null then raise exception 'Simulado não encontrado.' using errcode = 'insufficient_privilege'; end if;
  if v.status <> 'rascunho' then raise exception 'Simulado já publicado.' using errcode = 'check_violation'; end if;
  if not exists (select 1 from public.assessment_results r where r.assessment_id = v.id) then
    raise exception 'Registre ao menos uma nota antes de publicar.' using errcode = 'check_violation';
  end if;
  update public.assessments set status = 'publicado', published_at = now(), published_by = auth.uid() where id = v.id returning * into v;
  return v;
end $$;

-- Fluxo do relatório: orientador/supervisão enviam; somente supervisão revisa/aprova/devolve
create or replace function public.set_weekly_report_status(p_report uuid, p_status public.weekly_report_status, p_note text default null)
returns public.weekly_reports language plpgsql security invoker set search_path = '' as $$
declare v public.weekly_reports; v_sup boolean;
begin
  select * into v from public.weekly_reports where id = p_report for update;
  if v.id is null then raise exception 'Relatório não encontrado.' using errcode = 'insufficient_privilege'; end if;
  v_sup := private.has_program_role(v.program_id, '{supervisao}');
  if p_status = 'enviado' then
    if v.status not in ('rascunho', 'devolvido') then raise exception 'Só rascunhos ou devolvidos podem ser enviados.' using errcode = 'check_violation'; end if;
    if nullif(btrim(v.outcomes), '') is null or nullif(btrim(v.next_steps), '') is null then
      raise exception 'Preencha resultados e próximas entregas antes de enviar.' using errcode = 'check_violation';
    end if;
  elsif p_status in ('em_revisao', 'aprovado', 'devolvido') then
    if not v_sup then raise exception 'Somente a supervisão revisa relatórios.' using errcode = 'insufficient_privilege'; end if;
    if p_status = 'em_revisao' and v.status <> 'enviado' then raise exception 'Só relatórios enviados entram em revisão.' using errcode = 'check_violation'; end if;
    if p_status in ('aprovado', 'devolvido') and v.status not in ('enviado', 'em_revisao') then
      raise exception 'Só relatórios enviados ou em revisão podem ser aprovados/devolvidos.' using errcode = 'check_violation';
    end if;
    if p_status = 'devolvido' and nullif(btrim(p_note), '') is null then
      raise exception 'Devolução exige orientação para ajuste.' using errcode = 'check_violation';
    end if;
  else
    raise exception 'Transição inválida.' using errcode = 'check_violation';
  end if;

  perform set_config('app.weekly_report_flow', 'on', true);
  update public.weekly_reports set
    status = p_status,
    submitted_at = case when p_status = 'enviado' then now() else submitted_at end,
    submitted_by = case when p_status = 'enviado' then auth.uid() else submitted_by end,
    reviewed_at = case when p_status in ('aprovado', 'devolvido') then now() else reviewed_at end,
    reviewed_by = case when p_status in ('aprovado', 'devolvido') then auth.uid() else reviewed_by end,
    review_note = case when p_status in ('aprovado', 'devolvido') then nullif(btrim(p_note), '') else review_note end
  where id = v.id returning * into v;
  perform set_config('app.weekly_report_flow', '', true);
  if v.id is null then raise exception 'Sem permissão.' using errcode = 'insufficient_privilege'; end if;
  return v;
end $$;

-- Correção após aprovação: nova versão em rascunho, preservando a aprovada
create or replace function public.correct_weekly_report(p_report uuid)
returns public.weekly_reports language plpgsql security invoker set search_path = '' as $$
declare v_src public.weekly_reports; v_new public.weekly_reports;
begin
  select * into v_src from public.weekly_reports where id = p_report;
  if v_src.id is null then raise exception 'Relatório não encontrado.' using errcode = 'insufficient_privilege'; end if;
  if v_src.status <> 'aprovado' then raise exception 'Correção versionada só se aplica a relatórios aprovados.' using errcode = 'check_violation'; end if;
  if exists (select 1 from public.weekly_reports where team_id = v_src.team_id and week_start = v_src.week_start and version > v_src.version) then
    raise exception 'Já existe versão mais recente deste relatório.' using errcode = 'check_violation';
  end if;
  insert into public.weekly_reports (program_id, team_id, week_start, version, supersedes_id, planned_minutes, actual_minutes,
    outcomes, blockers, intervention, next_steps)
  values (v_src.program_id, v_src.team_id, v_src.week_start, v_src.version + 1, v_src.id, v_src.planned_minutes, v_src.actual_minutes,
    v_src.outcomes, v_src.blockers, v_src.intervention, v_src.next_steps)
  returning * into v_new;
  return v_new;
end $$;

revoke execute on function public.publish_training_plan(uuid), public.new_training_plan_version(uuid, text),
  public.publish_assessment(uuid), public.set_weekly_report_status(uuid, public.weekly_report_status, text),
  public.correct_weekly_report(uuid) from public, anon;
grant execute on function public.publish_training_plan(uuid), public.new_training_plan_version(uuid, text),
  public.publish_assessment(uuid), public.set_weekly_report_status(uuid, public.weekly_report_status, text),
  public.correct_weekly_report(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
grant select, insert, update on public.allocations, public.competencies, public.training_plans,
  public.training_sessions, public.assessments, public.assessment_errors, public.score_targets, public.weekly_reports to authenticated;
grant select, insert, update, delete on public.training_items, public.attendance, public.assessment_results to authenticated;
grant all on public.allocations, public.competencies, public.training_plans, public.training_items, public.training_sessions,
  public.attendance, public.assessments, public.assessment_results, public.assessment_errors, public.score_targets,
  public.weekly_reports to service_role;

alter table public.allocations enable row level security;
alter table public.competencies enable row level security;
alter table public.training_plans enable row level security;
alter table public.training_items enable row level security;
alter table public.training_sessions enable row level security;
alter table public.attendance enable row level security;
alter table public.assessments enable row level security;
alter table public.assessment_results enable row level security;
alter table public.assessment_errors enable row level security;
alter table public.score_targets enable row level security;
alter table public.weekly_reports enable row level security;

create or replace function private.parent_scope_ok(p_table text, p_id uuid, p_manage boolean) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_program uuid; v_team uuid;
begin
  case p_table
    when 'training_plans' then select program_id, team_id into v_program, v_team from public.training_plans where id = p_id;
    when 'training_sessions' then select program_id, team_id into v_program, v_team from public.training_sessions where id = p_id;
    when 'assessments' then select program_id, team_id into v_program, v_team from public.assessments where id = p_id;
    else return false;
  end case;
  if v_program is null then return false; end if;
  return case when p_manage then private.can_manage_scope(v_program, v_team) else private.can_read_scope(v_program, v_team) end;
end $$;
grant execute on function private.parent_scope_ok(text, uuid, boolean), private.competency_matches_team(uuid, uuid) to authenticated;

-- Alocação: supervisão/gestão do programa; a própria pessoa; orientador da equipe alocada
create policy allocations_select on public.allocations for select to authenticated using (
  private.has_program_role(program_id, '{supervisao,gestao}')
  or exists (select 1 from public.people pe where pe.id = person_id and pe.user_id = auth.uid())
  or (team_id is not null and private.is_team_advisor(program_id, team_id))
);
create policy allocations_insert on public.allocations for insert to authenticated with check (private.has_program_role(program_id, '{supervisao}'));
create policy allocations_update on public.allocations for update to authenticated
  using (private.has_program_role(program_id, '{supervisao}')) with check (private.has_program_role(program_id, '{supervisao}'));

create policy competencies_select on public.competencies for select to authenticated using (private.is_program_member(program_id));
create policy competencies_insert on public.competencies for insert to authenticated with check (private.has_program_role(program_id, '{supervisao}'));
create policy competencies_update on public.competencies for update to authenticated
  using (private.has_program_role(program_id, '{supervisao}')) with check (private.has_program_role(program_id, '{supervisao}'));

create policy training_plans_select on public.training_plans for select to authenticated using (private.can_read_scope(program_id, team_id));
create policy training_plans_insert on public.training_plans for insert to authenticated with check (private.can_manage_scope(program_id, team_id));
create policy training_plans_update on public.training_plans for update to authenticated
  using (private.can_manage_scope(program_id, team_id)) with check (private.can_manage_scope(program_id, team_id));

create policy training_items_select on public.training_items for select to authenticated using (private.parent_scope_ok('training_plans', plan_id, false));
create policy training_items_insert on public.training_items for insert to authenticated with check (private.parent_scope_ok('training_plans', plan_id, true));
create policy training_items_update on public.training_items for update to authenticated
  using (private.parent_scope_ok('training_plans', plan_id, true)) with check (private.parent_scope_ok('training_plans', plan_id, true));
create policy training_items_delete on public.training_items for delete to authenticated using (private.parent_scope_ok('training_plans', plan_id, true));

create policy training_sessions_select on public.training_sessions for select to authenticated using (private.can_read_scope(program_id, team_id));
create policy training_sessions_insert on public.training_sessions for insert to authenticated with check (private.can_manage_scope(program_id, team_id));
create policy training_sessions_update on public.training_sessions for update to authenticated
  using (private.can_manage_scope(program_id, team_id)) with check (private.can_manage_scope(program_id, team_id));

create policy attendance_select on public.attendance for select to authenticated using (private.parent_scope_ok('training_sessions', session_id, false));
create policy attendance_insert on public.attendance for insert to authenticated with check (private.parent_scope_ok('training_sessions', session_id, true));
create policy attendance_update on public.attendance for update to authenticated
  using (private.parent_scope_ok('training_sessions', session_id, true)) with check (private.parent_scope_ok('training_sessions', session_id, true));
create policy attendance_delete on public.attendance for delete to authenticated using (private.parent_scope_ok('training_sessions', session_id, true));

create policy assessments_select on public.assessments for select to authenticated using (private.can_read_scope(program_id, team_id));
create policy assessments_insert on public.assessments for insert to authenticated with check (private.can_manage_scope(program_id, team_id));
create policy assessments_update on public.assessments for update to authenticated
  using (private.can_manage_scope(program_id, team_id)) with check (private.can_manage_scope(program_id, team_id));

create policy assessment_results_select on public.assessment_results for select to authenticated using (private.parent_scope_ok('assessments', assessment_id, false));
create policy assessment_results_insert on public.assessment_results for insert to authenticated with check (private.parent_scope_ok('assessments', assessment_id, true));
create policy assessment_results_update on public.assessment_results for update to authenticated
  using (private.parent_scope_ok('assessments', assessment_id, true)) with check (private.parent_scope_ok('assessments', assessment_id, true));
create policy assessment_results_delete on public.assessment_results for delete to authenticated using (private.parent_scope_ok('assessments', assessment_id, true));

create policy assessment_errors_select on public.assessment_errors for select to authenticated using (private.parent_scope_ok('assessments', assessment_id, false));
create policy assessment_errors_insert on public.assessment_errors for insert to authenticated with check (private.parent_scope_ok('assessments', assessment_id, true));
create policy assessment_errors_update on public.assessment_errors for update to authenticated
  using (private.parent_scope_ok('assessments', assessment_id, true)) with check (private.parent_scope_ok('assessments', assessment_id, true));

create policy score_targets_select on public.score_targets for select to authenticated using (private.is_program_member(program_id));
create policy score_targets_insert on public.score_targets for insert to authenticated with check (private.has_program_role(program_id, '{supervisao}'));
create policy score_targets_update on public.score_targets for update to authenticated
  using (private.has_program_role(program_id, '{supervisao}')) with check (private.has_program_role(program_id, '{supervisao}'));

create policy weekly_reports_select on public.weekly_reports for select to authenticated using (private.can_read_scope(program_id, team_id));
create policy weekly_reports_insert on public.weekly_reports for insert to authenticated with check (private.can_manage_scope(program_id, team_id));
create policy weekly_reports_update on public.weekly_reports for update to authenticated
  using (private.can_manage_scope(program_id, team_id)) with check (private.can_manage_scope(program_id, team_id));

-- Auditoria das novas entidades de configuração/planejamento
do $$
declare t text;
begin
  foreach t in array array['allocations', 'competencies', 'training_plans', 'score_targets', 'weekly_reports', 'assessments'] loop
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each row execute function private.audit()', t || '_audit', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Alertas: relatório semanal não enviado; nota abaixo da rampa (escala equivalente)
-- ---------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_rule_check;
alter table public.notifications add constraint notifications_rule_check
  check (rule in ('acao_vencida', 'checklist_pendente', 'relatorio_nao_enviado', 'nota_abaixo_rampa'));

create or replace function public.refresh_alerts_ws()
returns table (created integer, resolved integer)
language plpgsql security definer set search_path = '' as $$
declare v_created int := 0; v_resolved int := 0; v_n int;
  v_last_week date := (date_trunc('week', private.today()) - interval '7 days')::date;
begin
  -- Equipes com plano publicado vigente sem relatório enviado da semana anterior
  insert into public.notifications (user_id, program_id, rule, entity_table, entity_id, period_key, title, link, dedupe_key)
  select s, t.program_id, 'relatorio_nao_enviado', 'teams', t.id, v_last_week::text,
         'Fechamento semanal não enviado: ' || t.name || ' (semana de ' || to_char(v_last_week, 'DD/MM') || ')',
         '/acompanhamentos?programa=' || t.program_id,
         'relatorio_nao_enviado:' || t.id || ':' || v_last_week || ':' || s
  from public.teams t
  cross join lateral private.program_supervisors(t.program_id) s
  where t.archived_at is null
    and exists (select 1 from public.training_plans p where p.team_id = t.id and p.status = 'publicado'
                and p.period_start <= v_last_week + 6 and p.period_end >= v_last_week)
    and not exists (select 1 from public.weekly_reports r where r.team_id = t.id and r.week_start = v_last_week and r.status <> 'rascunho')
  on conflict (dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_created := v_created + v_n;

  -- Simulado publicado (resultado da equipe) abaixo da meta da rampa do mês, mesma escala
  insert into public.notifications (user_id, program_id, rule, entity_table, entity_id, period_key, title, link, dedupe_key)
  select s, a.program_id, 'nota_abaixo_rampa', 'assessments', a.id, a.held_on::text,
         'Simulado abaixo da rampa: ' || a.title || ' (' || r.score || ' < ' || st.target || ')',
         '/worldskills/simulados/' || a.id,
         'nota_abaixo_rampa:' || a.id || ':' || s
  from public.assessments a
  join public.assessment_results r on r.assessment_id = a.id and r.person_id is null and r.criterion is null
  join public.score_targets st on st.occupation_id = a.occupation_id and st.scale = a.scale
       and st.month = date_trunc('month', a.held_on)::date
  cross join lateral private.program_supervisors(a.program_id) s
  where a.status = 'publicado' and r.score < st.target
  on conflict (dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_created := v_created + v_n;

  update public.notifications n set resolved_at = now()
  where n.resolved_at is null and n.rule = 'relatorio_nao_enviado'
    and exists (select 1 from public.weekly_reports r where r.team_id = n.entity_id and r.week_start::text = n.period_key and r.status <> 'rascunho');
  get diagnostics v_n = row_count; v_resolved := v_resolved + v_n;

  return query select v_created, v_resolved;
end $$;
revoke execute on function public.refresh_alerts_ws() from public, anon, authenticated;
grant execute on function public.refresh_alerts_ws() to service_role;

revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon;

-- >>>>> supabase/migrations/20261126000050_ciclo_2027_2028.sql
-- =============================================================================
-- COMPETE VIX — Ciclo renomeado para 2027–2028 (decisão da supervisão em 25/11/2026)
-- Idempotente: só altera o ciclo de referência "2027" se o novo código ainda não existir.
-- Os programas continuam ligados ao mesmo ciclo (mesmo id); só código e nome mudam.
-- =============================================================================
update public.cycles
   set code = '2027-2028', name = 'Ciclo 2027–2028'
 where code = '2027'
   and not exists (select 1 from public.cycles where code = '2027-2028');

-- >>>>> supabase/migrations/20261126000100_inova.sql
-- =============================================================================
-- COMPETE VIX — Etapa 3: INOVA SENAI (RF08) — PRD §7, §8, §12 (item 3)
-- Projetos com funil de maturidade; avanço só com evidência e revisão da supervisão;
-- rubricas versionadas (a interna preliminar NÃO é oficial); bancas com avaliadores
-- temporários restritos à banca atribuída; notas dentro do limite; publicação só
-- completa; avaliação publicada imutável, revisão cria nova versão.
-- =============================================================================

create type public.project_stage as enum (
  'prospeccao', 'selecao', 'anterioridade', 'validacao_problema', 'prototipo',
  'validacao_tecnica_financeira', 'banca_pitch', 'prioritario'
);
create type public.project_evidence_kind as enum (
  'comparacao_mercado', 'diferencial_tecnico', 'validacao_industrial', 'teste_produtividade_custo_qualidade',
  'viabilidade_financeira', 'modelo_negocio', 'anterioridade', 'prototipo_funcional', 'outro'
);
create type public.rubric_status as enum ('rascunho', 'publicada', 'substituida');
create type public.panel_status as enum ('planejada', 'publicada', 'substituida');
create type public.assignment_status as enum ('pendente', 'submetida');

-- Ordem do funil (fonte única para as regras de avanço)
create or replace function private.stage_order(p public.project_stage) returns int
language sql immutable set search_path = '' as $$
  select array_position(enum_range(null::public.project_stage), p)
$$;

-- ---------------------------------------------------------------------------
-- Projetos
-- ---------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null,
  team_id uuid not null,
  title text not null check (length(btrim(title)) between 3 and 200),
  problem text check (length(problem) <= 4000),
  solution text check (length(solution) <= 4000),
  partner_company text check (length(partner_company) <= 200),
  value_proposition text check (length(value_proposition) <= 4000),
  differential text check (length(differential) <= 4000),
  business_model text check (length(business_model) <= 4000),
  stage public.project_stage not null default 'prospeccao',
  stage_changed_at timestamptz not null default now(),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  constraint projects_team_fk foreign key (team_id, program_id) references public.teams (id, program_id),
  constraint projects_scope_uk unique (id, program_id)
);
create index projects_program_idx on public.projects (program_id, stage);
create index projects_team_idx on public.projects (team_id);

create table public.project_evidences (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  program_id uuid not null,
  -- Etapa do funil em que a evidência foi registrada (sempre sobrescrita pelo gatilho)
  stage public.project_stage not null default 'prospeccao',
  kind public.project_evidence_kind not null,
  description text not null check (length(btrim(description)) between 3 and 2000),
  document_id uuid,
  url text check (url ~* '^https://[^[:space:]]+$' and length(url) <= 2000),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references public.profiles (id),
  constraint project_evidences_project_fk foreign key (project_id, program_id) references public.projects (id, program_id),
  constraint project_evidences_document_fk foreign key (document_id, program_id) references public.documents (id, program_id)
);
create index project_evidences_project_idx on public.project_evidences (project_id, stage);

create table public.project_stage_history (
  id bigint generated always as identity primary key,
  project_id uuid not null,
  program_id uuid not null,
  from_stage public.project_stage not null,
  to_stage public.project_stage not null,
  note text check (length(note) <= 2000),
  reviewer uuid not null references public.profiles (id),
  evidence_count integer not null,
  created_at timestamptz not null default now(),
  constraint project_stage_history_fk foreign key (project_id, program_id) references public.projects (id, program_id)
);
create index project_stage_history_project_idx on public.project_stage_history (project_id, created_at);

-- ---------------------------------------------------------------------------
-- Rubricas versionadas
-- ---------------------------------------------------------------------------
create table public.rubrics (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id),
  name text not null check (length(btrim(name)) between 3 and 160),
  description text check (length(description) <= 2000),
  -- Rubrica oficial (regulamento) x interna (proposta). PRD §7: não confundir.
  official boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  constraint rubrics_name_uk unique (competition_id, name)
);

create table public.rubric_versions (
  id uuid primary key default gen_random_uuid(),
  rubric_id uuid not null references public.rubrics (id),
  version integer not null check (version >= 1),
  status public.rubric_status not null default 'rascunho',
  -- Método configurável: agregação, faixas de classificação e metas de referência
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  notes text check (length(notes) <= 2000),
  published_at timestamptz,
  published_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  constraint rubric_versions_uk unique (rubric_id, version)
);

create table public.rubric_criteria (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.rubric_versions (id) on delete cascade,
  parent_id uuid references public.rubric_criteria (id) on delete cascade,
  code text not null check (length(btrim(code)) between 1 and 30),
  name text not null check (length(btrim(name)) between 2 and 160),
  description text check (length(description) <= 1000),
  max_score numeric(6,2) not null check (max_score > 0),
  position smallint not null default 0 check (position >= 0),
  constraint rubric_criteria_code_uk unique (version_id, code),
  constraint rubric_criteria_self_ck check (parent_id is null or parent_id <> id)
);
create index rubric_criteria_version_idx on public.rubric_criteria (version_id, position);

-- ---------------------------------------------------------------------------
-- Bancas, avaliadores e notas
-- ---------------------------------------------------------------------------
create table public.panels (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null,
  project_id uuid not null,
  rubric_version_id uuid not null references public.rubric_versions (id),
  title text not null check (length(btrim(title)) between 3 and 160),
  held_on date not null,
  version integer not null default 1 check (version >= 1),
  supersedes_id uuid,
  revision_note text check (length(revision_note) <= 2000),
  status public.panel_status not null default 'planejada',
  published_at timestamptz,
  published_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  constraint panels_project_fk foreign key (project_id, program_id) references public.projects (id, program_id),
  constraint panels_scope_uk unique (id, program_id),
  constraint panels_supersedes_fk foreign key (supersedes_id, program_id) references public.panels (id, program_id)
);
create index panels_project_idx on public.panels (project_id, held_on);

create table public.panel_assignments (
  id uuid primary key default gen_random_uuid(),
  panel_id uuid not null,
  program_id uuid not null,
  evaluator_id uuid not null references public.profiles (id),
  status public.assignment_status not null default 'pendente',
  submitted_at timestamptz,
  general_comment text check (length(general_comment) <= 4000),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  constraint panel_assignments_panel_fk foreign key (panel_id, program_id) references public.panels (id, program_id) on delete cascade,
  constraint panel_assignments_uk unique (panel_id, evaluator_id),
  constraint panel_assignments_scope_uk unique (id, program_id)
);
create index panel_assignments_evaluator_idx on public.panel_assignments (evaluator_id);

create table public.panel_scores (
  assignment_id uuid not null,
  program_id uuid not null,
  criterion_id uuid not null references public.rubric_criteria (id),
  score numeric(6,2) not null check (score >= 0),
  comment text check (length(comment) <= 2000),
  updated_at timestamptz not null default now(),
  primary key (assignment_id, criterion_id),
  constraint panel_scores_assignment_fk foreign key (assignment_id, program_id) references public.panel_assignments (id, program_id) on delete cascade
);

create trigger projects_touch before update on public.projects for each row execute function private.touch_updated_at();
create trigger rubrics_touch before update on public.rubrics for each row execute function private.touch_updated_at();
create trigger panels_touch before update on public.panels for each row execute function private.touch_updated_at();
create trigger panel_scores_touch before update on public.panel_scores for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Funções de acesso
-- ---------------------------------------------------------------------------
-- Avaliador com vínculo "avaliador" vigente no programa E designado para a banca
create or replace function private.is_panel_evaluator(p_panel uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.panel_assignments a join public.panels p on p.id = a.panel_id
    where a.panel_id = p_panel and a.evaluator_id = auth.uid()
      and private.has_program_role(p.program_id, '{avaliador}')
  )
$$;

create or replace function private.project_scope_ok(p_project uuid, p_manage boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.projects pr where pr.id = p_project
      and case when p_manage then private.can_manage_scope(pr.program_id, pr.team_id)
               else private.can_read_scope(pr.program_id, pr.team_id)
                    or exists (select 1 from public.panels pa where pa.project_id = pr.id and private.is_panel_evaluator(pa.id)) end
  )
$$;

create or replace function private.panel_read_ok(p_panel uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.panels pa join public.projects pr on pr.id = pa.project_id
    where pa.id = p_panel and (private.can_read_scope(pr.program_id, pr.team_id) or private.is_panel_evaluator(pa.id))
  )
$$;

-- Supervisão de algum programa da competição (rubricas são por competição)
create or replace function private.supervises_competition(p_competition uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_admin() or exists (
    select 1 from public.programs pr
    where pr.competition_id = p_competition and private.has_program_role(pr.id, '{supervisao}')
  )
$$;

grant execute on function private.is_panel_evaluator(uuid), private.project_scope_ok(uuid, boolean),
  private.panel_read_ok(uuid), private.supervises_competition(uuid), private.stage_order(public.project_stage) to authenticated;

-- ---------------------------------------------------------------------------
-- Regras de integridade (gatilhos)
-- ---------------------------------------------------------------------------
create or replace function private.projects_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.stage <> 'prospeccao' then raise exception 'Projeto começa em prospecção.' using errcode = 'check_violation'; end if;
    return new;
  end if;
  if new.stage is distinct from old.stage and current_setting('app.project_flow', true) is distinct from 'on' then
    raise exception 'Mude a etapa pelo fluxo de avanço (com evidência e revisão).' using errcode = 'check_violation';
  end if;
  if (new.program_id, new.team_id) is distinct from (old.program_id, old.team_id) then
    raise exception 'Programa e equipe do projeto são imutáveis.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger projects_guard before insert or update on public.projects for each row execute function private.projects_guard();

create or replace function private.project_evidences_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select p.stage into new.stage from public.projects p where p.id = new.project_id;
  if new.document_id is null and new.url is null and new.kind <> 'outro' and length(btrim(new.description)) < 20 then
    raise exception 'Descreva a evidência (mín. 20 caracteres) ou anexe documento/link.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger project_evidences_guard before insert on public.project_evidences for each row execute function private.project_evidences_guard();

create or replace function private.rubric_criteria_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_status public.rubric_status; v_parent_version uuid; v_parent_parent uuid;
begin
  select status into v_status from public.rubric_versions where id = coalesce(new.version_id, old.version_id);
  if v_status <> 'rascunho' then
    raise exception 'Rubrica publicada é imutável; crie uma nova versão.' using errcode = 'check_violation';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if new.parent_id is not null then
    select version_id, parent_id into v_parent_version, v_parent_parent from public.rubric_criteria where id = new.parent_id;
    if v_parent_version is distinct from new.version_id then
      raise exception 'Critério pai deve ser da mesma versão.' using errcode = 'check_violation';
    end if;
    if v_parent_parent is not null then
      raise exception 'A rubrica admite apenas dois níveis (grupo e critério).' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
create trigger rubric_criteria_guard before insert or update or delete on public.rubric_criteria
  for each row execute function private.rubric_criteria_guard();

create or replace function private.rubric_versions_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status <> 'rascunho' and (new.settings, new.rubric_id, new.version) is distinct from (old.settings, old.rubric_id, old.version) then
    raise exception 'Rubrica publicada é imutável; crie uma nova versão.' using errcode = 'check_violation';
  end if;
  if old.status = 'substituida' and new.status <> 'substituida' then
    raise exception 'Versão substituída não volta a ser publicada.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger rubric_versions_guard before update on public.rubric_versions for each row execute function private.rubric_versions_guard();

create or replace function private.panels_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_status public.rubric_status;
begin
  if tg_op = 'INSERT' then
    select status into v_status from public.rubric_versions where id = new.rubric_version_id;
    if v_status is distinct from 'publicada' then
      raise exception 'A banca deve usar uma versão de rubrica publicada.' using errcode = 'check_violation';
    end if;
    if new.status <> 'planejada' then raise exception 'Banca começa planejada.' using errcode = 'check_violation'; end if;
    return new;
  end if;
  if old.status <> 'planejada' and current_setting('app.panel_flow', true) is distinct from 'on' then
    raise exception 'Banca publicada é imutável; registre uma revisão (nova versão).' using errcode = 'check_violation';
  end if;
  if new.status is distinct from old.status and current_setting('app.panel_flow', true) is distinct from 'on' then
    raise exception 'Use a publicação da banca.' using errcode = 'check_violation';
  end if;
  if (new.project_id, new.program_id, new.rubric_version_id) is distinct from (old.project_id, old.program_id, old.rubric_version_id)
     and exists (select 1 from public.panel_assignments a where a.panel_id = old.id and a.status = 'submetida') then
    raise exception 'Já há avaliações enviadas: projeto e rubrica não podem mudar.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger panels_guard before insert or update on public.panels for each row execute function private.panels_guard();

create or replace function private.panel_assignments_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_panel public.panels; v_ok boolean;
begin
  select * into v_panel from public.panels where id = coalesce(new.panel_id, old.panel_id);
  if tg_op = 'DELETE' then
    if v_panel.status <> 'planejada' or old.status = 'submetida' then
      raise exception 'Avaliação enviada ou banca publicada não pode ser removida.' using errcode = 'check_violation';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if v_panel.status <> 'planejada' then raise exception 'Banca já publicada.' using errcode = 'check_violation'; end if;
    -- O avaliador precisa ter vínculo "avaliador" vigente no programa (acesso temporário)
    select exists (
      select 1 from public.memberships m
      join public.programs pr on pr.id = v_panel.program_id
      join public.profiles p on p.id = m.user_id and p.active
      where m.user_id = new.evaluator_id and m.role = 'avaliador' and m.revoked_at is null
        and (m.program_id = pr.id)
        and m.valid_from <= private.today() and (m.valid_to is null or m.valid_to >= private.today())
    ) into v_ok;
    if not v_ok then
      raise exception 'O usuário precisa de vínculo de avaliador vigente neste programa.' using errcode = 'check_violation';
    end if;
    if new.status <> 'pendente' then raise exception 'Designação começa pendente.' using errcode = 'check_violation'; end if;
    return new;
  end if;
  if old.status = 'submetida' then raise exception 'Avaliação enviada é imutável.' using errcode = 'check_violation'; end if;
  if new.status is distinct from old.status and current_setting('app.panel_flow', true) is distinct from 'on' then
    raise exception 'Use o envio da avaliação.' using errcode = 'check_violation';
  end if;
  if (new.evaluator_id, new.panel_id) is distinct from (old.evaluator_id, old.panel_id) then
    raise exception 'Designação imutável.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger panel_assignments_guard before insert or update or delete on public.panel_assignments
  for each row execute function private.panel_assignments_guard();

create or replace function private.panel_scores_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_a public.panel_assignments; v_panel public.panels; v_c public.rubric_criteria;
begin
  select * into v_a from public.panel_assignments where id = coalesce(new.assignment_id, old.assignment_id);
  select * into v_panel from public.panels where id = v_a.panel_id;
  if v_a.status <> 'pendente' or v_panel.status <> 'planejada' then
    raise exception 'Avaliação enviada ou banca publicada: notas imutáveis.' using errcode = 'check_violation';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  select * into v_c from public.rubric_criteria where id = new.criterion_id;
  if v_c.version_id is distinct from v_panel.rubric_version_id then
    raise exception 'Critério não pertence à rubrica da banca.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.rubric_criteria c where c.parent_id = v_c.id) then
    raise exception 'Pontue os critérios, não o grupo (o grupo é a soma).' using errcode = 'check_violation';
  end if;
  if new.score > v_c.max_score then
    raise exception 'Nota % acima do máximo do critério "%" (%).', new.score, v_c.name, v_c.max_score using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger panel_scores_guard before insert or update or delete on public.panel_scores
  for each row execute function private.panel_scores_guard();

-- ---------------------------------------------------------------------------
-- Operações transacionais
-- ---------------------------------------------------------------------------
-- Avanço/retorno no funil: só supervisão; avanço = etapa seguinte com ≥1 evidência
-- na etapa atual; "prioritário" exige banca publicada; retorno exige justificativa.
create or replace function public.advance_project_stage(p_project uuid, p_to public.project_stage, p_note text default null)
returns public.projects language plpgsql security definer set search_path = '' as $$
declare v public.projects; v_ev int; v_from int; v_to int;
begin
  select * into v from public.projects where id = p_project for update;
  if v.id is null or not private.has_program_role(v.program_id, '{supervisao}') then
    raise exception 'Somente a supervisão do programa revisa o avanço de etapa.' using errcode = 'insufficient_privilege';
  end if;
  if v.archived_at is not null then raise exception 'Projeto arquivado.' using errcode = 'check_violation'; end if;
  v_from := private.stage_order(v.stage);
  v_to := private.stage_order(p_to);
  select count(*) into v_ev from public.project_evidences e where e.project_id = v.id and e.stage = v.stage;
  if v_to = v_from then
    raise exception 'O projeto já está nesta etapa.' using errcode = 'check_violation';
  elsif v_to > v_from then
    if v_to <> v_from + 1 then
      raise exception 'Avance uma etapa por vez (o funil não admite saltos).' using errcode = 'check_violation';
    end if;
    if v_ev = 0 then
      raise exception 'Registre ao menos uma evidência na etapa atual antes de avançar.' using errcode = 'check_violation';
    end if;
    if p_to = 'prioritario' and not exists (
      select 1 from public.panels pa where pa.project_id = v.id and pa.status = 'publicada'
    ) then
      raise exception 'Para priorizar, o projeto precisa de banca publicada.' using errcode = 'check_violation';
    end if;
  elsif nullif(btrim(p_note), '') is null then
    raise exception 'Retorno de etapa exige justificativa.' using errcode = 'check_violation';
  end if;

  insert into public.project_stage_history (project_id, program_id, from_stage, to_stage, note, reviewer, evidence_count)
  values (v.id, v.program_id, v.stage, p_to, nullif(btrim(p_note), ''), auth.uid(), v_ev);
  perform set_config('app.project_flow', 'on', true);
  update public.projects set stage = p_to, stage_changed_at = now() where id = v.id returning * into v;
  perform set_config('app.project_flow', '', true);
  return v;
end $$;

-- Publica rubrica: grupos devem somar os máximos dos critérios; substitui a anterior
create or replace function public.publish_rubric_version(p_version uuid)
returns public.rubric_versions language plpgsql security definer set search_path = '' as $$
declare v public.rubric_versions; v_comp uuid; v_bad int;
begin
  select * into v from public.rubric_versions where id = p_version for update;
  select competition_id into v_comp from public.rubrics where id = v.rubric_id;
  if v.id is null or not private.supervises_competition(v_comp) then
    raise exception 'Sem permissão para publicar esta rubrica.' using errcode = 'insufficient_privilege';
  end if;
  if v.status <> 'rascunho' then raise exception 'Apenas rascunhos podem ser publicados.' using errcode = 'check_violation'; end if;
  if not exists (select 1 from public.rubric_criteria where version_id = v.id) then
    raise exception 'Inclua critérios antes de publicar.' using errcode = 'check_violation';
  end if;
  select count(*) into v_bad from public.rubric_criteria g
  where g.version_id = v.id and exists (select 1 from public.rubric_criteria c where c.parent_id = g.id)
    and g.max_score <> (select sum(c.max_score) from public.rubric_criteria c where c.parent_id = g.id);
  if v_bad > 0 then
    raise exception 'Há % grupo(s) cujo máximo difere da soma dos critérios.', v_bad using errcode = 'check_violation';
  end if;
  update public.rubric_versions set status = 'substituida' where rubric_id = v.rubric_id and status = 'publicada' and id <> v.id;
  update public.rubric_versions set status = 'publicada', published_at = now(), published_by = auth.uid() where id = v.id returning * into v;
  return v;
end $$;

create or replace function public.new_rubric_version(p_version uuid)
returns public.rubric_versions language plpgsql security definer set search_path = '' as $$
declare v_src public.rubric_versions; v_new public.rubric_versions; v_comp uuid; r record; v_map jsonb := '{}'::jsonb; v_id uuid;
begin
  select * into v_src from public.rubric_versions where id = p_version;
  select competition_id into v_comp from public.rubrics where id = v_src.rubric_id;
  if v_src.id is null or not private.supervises_competition(v_comp) then
    raise exception 'Sem permissão.' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.rubric_versions where rubric_id = v_src.rubric_id and status = 'rascunho') then
    raise exception 'Já existe um rascunho desta rubrica.' using errcode = 'check_violation';
  end if;
  insert into public.rubric_versions (rubric_id, version, settings, notes)
  select v_src.rubric_id, max(version) + 1, v_src.settings, null from public.rubric_versions where rubric_id = v_src.rubric_id
  returning * into v_new;
  for r in select * from public.rubric_criteria where version_id = v_src.id order by (parent_id is not null), position loop
    insert into public.rubric_criteria (version_id, parent_id, code, name, description, max_score, position)
    values (v_new.id, (v_map ->> r.parent_id::text)::uuid, r.code, r.name, r.description, r.max_score, r.position)
    returning id into v_id;
    v_map := v_map || jsonb_build_object(r.id::text, v_id);
  end loop;
  return v_new;
end $$;

-- Avaliador envia: exige todos os critérios pontuados; depois disso as notas congelam
create or replace function public.submit_panel_evaluation(p_assignment uuid, p_comment text default null)
returns public.panel_assignments language plpgsql security definer set search_path = '' as $$
declare v public.panel_assignments; v_panel public.panels; v_missing int;
begin
  select * into v from public.panel_assignments where id = p_assignment for update;
  if v.id is null or v.evaluator_id <> auth.uid() or not private.is_panel_evaluator(v.panel_id) then
    raise exception 'Somente o avaliador designado envia esta avaliação.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_panel from public.panels where id = v.panel_id;
  if v.status <> 'pendente' or v_panel.status <> 'planejada' then
    raise exception 'Avaliação já enviada ou banca publicada.' using errcode = 'check_violation';
  end if;
  select count(*) into v_missing from public.rubric_criteria c
  where c.version_id = v_panel.rubric_version_id
    and not exists (select 1 from public.rubric_criteria k where k.parent_id = c.id)
    and not exists (select 1 from public.panel_scores s where s.assignment_id = v.id and s.criterion_id = c.id);
  if v_missing > 0 then
    raise exception 'Faltam % critério(s) sem nota.', v_missing using errcode = 'check_violation';
  end if;
  perform set_config('app.panel_flow', 'on', true);
  update public.panel_assignments set status = 'submetida', submitted_at = now(), general_comment = nullif(btrim(p_comment), '')
  where id = v.id returning * into v;
  perform set_config('app.panel_flow', '', true);
  return v;
end $$;

-- Supervisão publica: todas as designações enviadas (sem publicação incompleta)
create or replace function public.publish_panel(p_panel uuid)
returns public.panels language plpgsql security definer set search_path = '' as $$
declare v public.panels;
begin
  select * into v from public.panels where id = p_panel for update;
  if v.id is null or not private.has_program_role(v.program_id, '{supervisao}') then
    raise exception 'Somente a supervisão publica bancas.' using errcode = 'insufficient_privilege';
  end if;
  if v.status <> 'planejada' then raise exception 'Banca já publicada.' using errcode = 'check_violation'; end if;
  if not exists (select 1 from public.panel_assignments a where a.panel_id = v.id) then
    raise exception 'Designe ao menos um avaliador.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.panel_assignments a where a.panel_id = v.id and a.status <> 'submetida') then
    raise exception 'Há avaliações pendentes: aguarde o envio ou remova a designação antes de publicar.' using errcode = 'check_violation';
  end if;
  perform set_config('app.panel_flow', 'on', true);
  update public.panels set status = 'publicada', published_at = now(), published_by = auth.uid() where id = v.id returning * into v;
  perform set_config('app.panel_flow', '', true);
  return v;
end $$;

-- Revisão de banca publicada: nova versão planejada com os mesmos avaliadores (novas notas)
create or replace function public.revise_panel(p_panel uuid, p_note text)
returns public.panels language plpgsql security definer set search_path = '' as $$
declare v_src public.panels; v_new public.panels;
begin
  select * into v_src from public.panels where id = p_panel for update;
  if v_src.id is null or not private.has_program_role(v_src.program_id, '{supervisao}') then
    raise exception 'Somente a supervisão revisa bancas.' using errcode = 'insufficient_privilege';
  end if;
  if v_src.status <> 'publicada' then raise exception 'Só bancas publicadas são revisadas por nova versão.' using errcode = 'check_violation'; end if;
  if nullif(btrim(p_note), '') is null then raise exception 'Informe o motivo da revisão.' using errcode = 'check_violation'; end if;
  perform set_config('app.panel_flow', 'on', true);
  update public.panels set status = 'substituida' where id = v_src.id;
  perform set_config('app.panel_flow', '', true);
  insert into public.panels (program_id, project_id, rubric_version_id, title, held_on, version, supersedes_id, revision_note)
  values (v_src.program_id, v_src.project_id, v_src.rubric_version_id, v_src.title, v_src.held_on, v_src.version + 1, v_src.id, btrim(p_note))
  returning * into v_new;
  insert into public.panel_assignments (panel_id, program_id, evaluator_id)
  select v_new.id, v_new.program_id, a.evaluator_id from public.panel_assignments a
  where a.panel_id = v_src.id and private.has_program_role(v_new.program_id, '{supervisao}')
  on conflict do nothing;
  return v_new;
end $$;

revoke execute on function public.advance_project_stage(uuid, public.project_stage, text), public.publish_rubric_version(uuid),
  public.new_rubric_version(uuid), public.submit_panel_evaluation(uuid, text), public.publish_panel(uuid), public.revise_panel(uuid, text)
  from public, anon;
grant execute on function public.advance_project_stage(uuid, public.project_stage, text), public.publish_rubric_version(uuid),
  public.new_rubric_version(uuid), public.submit_panel_evaluation(uuid, text), public.publish_panel(uuid), public.revise_panel(uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
grant select, insert, update on public.projects, public.rubrics, public.rubric_versions, public.panels to authenticated;
grant select, insert on public.project_evidences to authenticated;
grant select on public.project_stage_history to authenticated;
grant select, insert, update, delete on public.rubric_criteria, public.panel_assignments, public.panel_scores to authenticated;
grant all on public.projects, public.project_evidences, public.project_stage_history, public.rubrics, public.rubric_versions,
  public.rubric_criteria, public.panels, public.panel_assignments, public.panel_scores to service_role;

alter table public.projects enable row level security;
alter table public.project_evidences enable row level security;
alter table public.project_stage_history enable row level security;
alter table public.rubrics enable row level security;
alter table public.rubric_versions enable row level security;
alter table public.rubric_criteria enable row level security;
alter table public.panels enable row level security;
alter table public.panel_assignments enable row level security;
alter table public.panel_scores enable row level security;

create policy projects_select on public.projects for select to authenticated using (
  private.can_read_scope(program_id, team_id)
  or exists (select 1 from public.panels pa where pa.project_id = projects.id and private.is_panel_evaluator(pa.id))
);
create policy projects_insert on public.projects for insert to authenticated with check (private.can_manage_scope(program_id, team_id));
create policy projects_update on public.projects for update to authenticated
  using (private.can_manage_scope(program_id, team_id)) with check (private.can_manage_scope(program_id, team_id));

create policy project_evidences_select on public.project_evidences for select to authenticated using (private.project_scope_ok(project_id, false));
create policy project_evidences_insert on public.project_evidences for insert to authenticated with check (
  created_by = auth.uid() and private.project_scope_ok(project_id, true)
  and (document_id is null or private.can_read_document(document_id))
);
create policy project_stage_history_select on public.project_stage_history for select to authenticated using (private.project_scope_ok(project_id, false));

-- Rubricas não são sensíveis: leitura para usuários ativos; escrita pela supervisão da competição
create policy rubrics_select on public.rubrics for select to authenticated using (private.is_active_user());
create policy rubrics_insert on public.rubrics for insert to authenticated with check (private.supervises_competition(competition_id));
create policy rubrics_update on public.rubrics for update to authenticated
  using (private.supervises_competition(competition_id)) with check (private.supervises_competition(competition_id));

create policy rubric_versions_select on public.rubric_versions for select to authenticated using (private.is_active_user());
create policy rubric_versions_insert on public.rubric_versions for insert to authenticated with check (
  exists (select 1 from public.rubrics r where r.id = rubric_id and private.supervises_competition(r.competition_id))
);
create policy rubric_versions_update on public.rubric_versions for update to authenticated using (
  exists (select 1 from public.rubrics r where r.id = rubric_id and private.supervises_competition(r.competition_id))
);

create policy rubric_criteria_select on public.rubric_criteria for select to authenticated using (private.is_active_user());
create policy rubric_criteria_write on public.rubric_criteria for all to authenticated
  using (exists (select 1 from public.rubric_versions v join public.rubrics r on r.id = v.rubric_id where v.id = version_id and private.supervises_competition(r.competition_id)))
  with check (exists (select 1 from public.rubric_versions v join public.rubrics r on r.id = v.rubric_id where v.id = version_id and private.supervises_competition(r.competition_id)));

create policy panels_select on public.panels for select to authenticated using (private.panel_read_ok(id) or
  (private.has_program_role(program_id, '{supervisao,gestao}')));
create policy panels_insert on public.panels for insert to authenticated with check (private.has_program_role(program_id, '{supervisao}'));
create policy panels_update on public.panels for update to authenticated
  using (private.has_program_role(program_id, '{supervisao}')) with check (private.has_program_role(program_id, '{supervisao}'));

-- Designações: supervisão/gestão veem todas; avaliador vê só a própria; equipe vê após publicação
create policy panel_assignments_select on public.panel_assignments for select to authenticated using (
  private.has_program_role(program_id, '{supervisao,gestao}')
  or (evaluator_id = auth.uid() and private.is_panel_evaluator(panel_id))
  or exists (select 1 from public.panels pa where pa.id = panel_id and pa.status <> 'planejada' and private.panel_read_ok(pa.id))
);
create policy panel_assignments_insert on public.panel_assignments for insert to authenticated with check (private.has_program_role(program_id, '{supervisao}'));
create policy panel_assignments_update on public.panel_assignments for update to authenticated
  using (evaluator_id = auth.uid() or private.has_program_role(program_id, '{supervisao}'))
  with check (evaluator_id = auth.uid() or private.has_program_role(program_id, '{supervisao}'));
create policy panel_assignments_delete on public.panel_assignments for delete to authenticated using (private.has_program_role(program_id, '{supervisao}'));

-- Notas: avaliador só as próprias (avaliação independente); supervisão/gestão todas;
-- orientação/competidores só depois de publicada
create policy panel_scores_select on public.panel_scores for select to authenticated using (
  private.has_program_role(program_id, '{supervisao,gestao}')
  or exists (select 1 from public.panel_assignments a where a.id = assignment_id and a.evaluator_id = auth.uid() and private.is_panel_evaluator(a.panel_id))
  or exists (select 1 from public.panel_assignments a join public.panels pa on pa.id = a.panel_id
             where a.id = assignment_id and pa.status <> 'planejada' and private.panel_read_ok(pa.id))
);
create policy panel_scores_write on public.panel_scores for all to authenticated
  using (exists (select 1 from public.panel_assignments a where a.id = assignment_id and a.evaluator_id = auth.uid() and private.is_panel_evaluator(a.panel_id)))
  with check (exists (select 1 from public.panel_assignments a where a.id = assignment_id and a.evaluator_id = auth.uid() and private.is_panel_evaluator(a.panel_id)));

-- Avaliadores veem nomes da supervisão e vice-versa (perfis de quem compartilha banca)
create policy profiles_select_panels on public.profiles for select to authenticated using (
  exists (select 1 from public.panel_assignments a where a.evaluator_id = profiles.id and private.has_program_role(a.program_id, '{supervisao,gestao}'))
);

do $$
declare t text;
begin
  foreach t in array array['projects', 'rubric_versions', 'panels', 'panel_assignments'] loop
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each row execute function private.audit()', t || '_audit', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Rubrica interna PRELIMINAR (PRD §7) — referência proposta, NÃO oficial
-- Criada se a competição INOVA existir (instalação nova: chamada também no seed de referências).
-- ---------------------------------------------------------------------------
create or replace function private.seed_inova_rubric() returns void
language plpgsql security definer set search_path = '' as $$
declare v_comp uuid; v_rubric uuid; v_version uuid; v_inov uuid;
begin
  select id into v_comp from public.competitions where code = 'INOVA';
  if v_comp is null or exists (select 1 from public.rubrics where competition_id = v_comp and name = 'Rubrica interna preliminar INOVA') then
    return;
  end if;
  insert into public.rubrics (competition_id, name, description, official)
  values (v_comp, 'Rubrica interna preliminar INOVA',
          'Proposta do PRD v0.1 §7 com base nos infográficos. NÃO é o regulamento oficial; validar antes de usar como referência de resultado.', false)
  returning id into v_rubric;
  insert into public.rubric_versions (rubric_id, version, status, notes, settings)
  values (v_rubric, 1, 'rascunho', 'Versão inicial do PRD (método proposto, configurável).', jsonb_build_object(
    'agregacao', 'media_avaliacoes_completas',
    'arredondamento', 'nenhum_antes_da_classificacao',
    'faixas', jsonb_build_array(
      jsonb_build_object('min', 95, 'rotulo', 'Excelente'),
      jsonb_build_object('min', 90, 'rotulo', 'Muito bom'),
      jsonb_build_object('min', 80, 'rotulo', 'Intermediário'),
      jsonb_build_object('min', 70, 'rotulo', 'Baixo'),
      jsonb_build_object('min', 0, 'rotulo', 'Insuficiente')),
    'meta_total', 95,
    'meta_grupo', jsonb_build_object('codigo', 'INOV', 'valor', 38),
    'escala_inovacao', '0 = sem evidência (proposto); 1 reprodução; 2 adaptação; 3 incremental; 4 diferenciada; 5 alto impacto'
  ))
  returning id into v_version;
  insert into public.rubric_criteria (version_id, code, name, max_score, position, description)
  values (v_version, 'INOV', 'Inovação', 40, 0, 'Soma de oito critérios de 0 a 5.')
  returning id into v_inov;
  insert into public.rubric_criteria (version_id, parent_id, code, name, max_score, position)
  select v_version, v_inov, c.code, c.name, 5, c.pos from (values
    ('INOV-1', 'Originalidade', 0), ('INOV-2', 'Diferencial competitivo', 1), ('INOV-3', 'Complexidade tecnológica', 2),
    ('INOV-4', 'Relevância do problema', 3), ('INOV-5', 'Impacto', 4), ('INOV-6', 'Maturidade tecnológica', 5),
    ('INOV-7', 'Escalabilidade e replicabilidade', 6), ('INOV-8', 'Barreiras à reprodução', 7)
  ) c(code, name, pos);
  insert into public.rubric_criteria (version_id, code, name, max_score, position) values
    (v_version, 'PITCH', 'Pitch', 30, 1),
    (v_version, 'VALOR', 'Proposta de valor', 20, 2),
    (v_version, 'VIAB', 'Viabilidade e mercado', 10, 3);
  update public.rubric_versions set status = 'publicada', published_at = now() where id = v_version;
end $$;
select private.seed_inova_rubric();

revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon;

-- >>>>> supabase/migrations/20261126000200_inova_interno.sql
-- =============================================================================
-- COMPETE VIX — Ajuste da Etapa 3 (decisão da supervisão, 25/11/2026)
-- No INOVA o portal NÃO gerencia bancas nem avaliadores externos: a avaliação
-- oficial acontece no evento. A rubrica passa a ser usada em SIMULAÇÕES INTERNAS
-- (orientação/supervisão pontuam o próprio projeto para se preparar), e o
-- resultado oficial obtido no evento é registrado em project_results.
-- =============================================================================

-- 1) Quem avalia numa simulação: equipe interna do programa (orientação/supervisão)
--    ou, se um dia for usado, avaliador com vínculo vigente.
create or replace function private.is_panel_evaluator(p_panel uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.panel_assignments a join public.panels p on p.id = a.panel_id
    where a.panel_id = p_panel and a.evaluator_id = auth.uid()
      and private.has_program_role(p.program_id, '{avaliador,supervisao,orientador}')
  )
$$;

create or replace function private.user_has_program_role(p_user uuid, p_program uuid, p_roles public.membership_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    join public.programs pr on pr.id = p_program
    join public.profiles p on p.id = m.user_id and p.active
    where m.user_id = p_user and m.role = any (p_roles) and m.revoked_at is null
      and (m.program_id = pr.id or m.unit_id = pr.unit_id)
      and m.valid_from <= private.today() and (m.valid_to is null or m.valid_to >= private.today())
  )
$$;
grant execute on function private.user_has_program_role(uuid, uuid, public.membership_role[]) to authenticated;

create or replace function private.panel_assignments_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_panel public.panels;
begin
  select * into v_panel from public.panels where id = coalesce(new.panel_id, old.panel_id);
  if tg_op = 'DELETE' then
    if v_panel.status <> 'planejada' or old.status = 'submetida' then
      raise exception 'Avaliação concluída não pode ser removida.' using errcode = 'check_violation';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if v_panel.status <> 'planejada' then raise exception 'Simulação já concluída.' using errcode = 'check_violation'; end if;
    if not private.user_has_program_role(new.evaluator_id, v_panel.program_id, '{supervisao,orientador,avaliador}') then
      raise exception 'Quem pontua precisa ter vínculo vigente de supervisão, orientação ou avaliação neste programa.' using errcode = 'check_violation';
    end if;
    if new.status <> 'pendente' then raise exception 'Avaliação começa pendente.' using errcode = 'check_violation'; end if;
    return new;
  end if;
  if old.status = 'submetida' then raise exception 'Avaliação enviada é imutável.' using errcode = 'check_violation'; end if;
  if new.status is distinct from old.status and current_setting('app.panel_flow', true) is distinct from 'on' then
    raise exception 'Use a conclusão da avaliação.' using errcode = 'check_violation';
  end if;
  if (new.evaluator_id, new.panel_id) is distinct from (old.evaluator_id, old.panel_id) then
    raise exception 'Designação imutável.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- 2) Quem gerencia o projeto (orientação da equipe ou supervisão) cria e conclui simulações
drop policy panels_insert on public.panels;
drop policy panels_update on public.panels;
create policy panels_insert on public.panels for insert to authenticated with check (private.project_scope_ok(project_id, true));
create policy panels_update on public.panels for update to authenticated
  using (private.project_scope_ok(project_id, true)) with check (private.project_scope_ok(project_id, true));

-- Leitura avaliada pelas colunas da linha (necessário para INSERT ... RETURNING)
drop policy panels_select on public.panels;
create policy panels_select on public.panels for select to authenticated using (
  private.project_scope_ok(project_id, false)
  or private.is_panel_evaluator(id)
  or private.has_program_role(program_id, '{supervisao,gestao}')
);

drop policy panel_assignments_select on public.panel_assignments;
create policy panel_assignments_select on public.panel_assignments for select to authenticated using (
  private.has_program_role(program_id, '{supervisao,gestao}')
  or (evaluator_id = auth.uid() and private.has_program_role(program_id, '{avaliador,supervisao,orientador}'))
  or exists (select 1 from public.panels pa where pa.id = panel_id
             and (private.project_scope_ok(pa.project_id, true) or (pa.status <> 'planejada' and private.panel_read_ok(pa.id))))
);

drop policy panel_assignments_insert on public.panel_assignments;
drop policy panel_assignments_delete on public.panel_assignments;
create policy panel_assignments_insert on public.panel_assignments for insert to authenticated with check (
  exists (select 1 from public.panels pa where pa.id = panel_id and private.project_scope_ok(pa.project_id, true))
);
create policy panel_assignments_delete on public.panel_assignments for delete to authenticated using (
  exists (select 1 from public.panels pa where pa.id = panel_id and private.project_scope_ok(pa.project_id, true))
);

create or replace function public.publish_panel(p_panel uuid)
returns public.panels language plpgsql security definer set search_path = '' as $$
declare v public.panels;
begin
  select * into v from public.panels where id = p_panel for update;
  if v.id is null or not private.project_scope_ok(v.project_id, true) then
    raise exception 'Somente orientação da equipe ou supervisão concluem a simulação.' using errcode = 'insufficient_privilege';
  end if;
  if v.status <> 'planejada' then raise exception 'Simulação já concluída.' using errcode = 'check_violation'; end if;
  if not exists (select 1 from public.panel_assignments a where a.panel_id = v.id) then
    raise exception 'Nenhuma avaliação registrada.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.panel_assignments a where a.panel_id = v.id and a.status <> 'submetida') then
    raise exception 'Há avaliações não concluídas: conclua ou remova antes de fechar a simulação.' using errcode = 'check_violation';
  end if;
  perform set_config('app.panel_flow', 'on', true);
  update public.panels set status = 'publicada', published_at = now(), published_by = auth.uid() where id = v.id returning * into v;
  perform set_config('app.panel_flow', '', true);
  return v;
end $$;

create or replace function public.revise_panel(p_panel uuid, p_note text)
returns public.panels language plpgsql security definer set search_path = '' as $$
declare v_src public.panels; v_new public.panels;
begin
  select * into v_src from public.panels where id = p_panel for update;
  if v_src.id is null or not private.project_scope_ok(v_src.project_id, true) then
    raise exception 'Somente orientação da equipe ou supervisão revisam a simulação.' using errcode = 'insufficient_privilege';
  end if;
  if v_src.status <> 'publicada' then raise exception 'Só simulações concluídas são revisadas por nova versão.' using errcode = 'check_violation'; end if;
  if nullif(btrim(p_note), '') is null then raise exception 'Informe o motivo da revisão.' using errcode = 'check_violation'; end if;
  perform set_config('app.panel_flow', 'on', true);
  update public.panels set status = 'substituida' where id = v_src.id;
  perform set_config('app.panel_flow', '', true);
  insert into public.panels (program_id, project_id, rubric_version_id, title, held_on, version, supersedes_id, revision_note)
  values (v_src.program_id, v_src.project_id, v_src.rubric_version_id, v_src.title, v_src.held_on, v_src.version + 1, v_src.id, btrim(p_note))
  returning * into v_new;
  return v_new;
end $$;

-- 3) Priorizar não depende de banca no portal (só evidência + revisão da supervisão)
create or replace function public.advance_project_stage(p_project uuid, p_to public.project_stage, p_note text default null)
returns public.projects language plpgsql security definer set search_path = '' as $$
declare v public.projects; v_ev int; v_from int; v_to int;
begin
  select * into v from public.projects where id = p_project for update;
  if v.id is null or not private.has_program_role(v.program_id, '{supervisao}') then
    raise exception 'Somente a supervisão do programa revisa o avanço de etapa.' using errcode = 'insufficient_privilege';
  end if;
  if v.archived_at is not null then raise exception 'Projeto arquivado.' using errcode = 'check_violation'; end if;
  v_from := private.stage_order(v.stage);
  v_to := private.stage_order(p_to);
  select count(*) into v_ev from public.project_evidences e where e.project_id = v.id and e.stage = v.stage;
  if v_to = v_from then
    raise exception 'O projeto já está nesta etapa.' using errcode = 'check_violation';
  elsif v_to > v_from then
    if v_to <> v_from + 1 then
      raise exception 'Avance uma etapa por vez (o funil não admite saltos).' using errcode = 'check_violation';
    end if;
    if v_ev = 0 then
      raise exception 'Registre ao menos uma evidência na etapa atual antes de avançar.' using errcode = 'check_violation';
    end if;
  elsif nullif(btrim(p_note), '') is null then
    raise exception 'Retorno de etapa exige justificativa.' using errcode = 'check_violation';
  end if;
  insert into public.project_stage_history (project_id, program_id, from_stage, to_stage, note, reviewer, evidence_count)
  values (v.id, v.program_id, v.stage, p_to, nullif(btrim(p_note), ''), auth.uid(), v_ev);
  perform set_config('app.project_flow', 'on', true);
  update public.projects set stage = p_to, stage_changed_at = now() where id = v.id returning * into v;
  perform set_config('app.project_flow', '', true);
  return v;
end $$;

-- 4) Resultado oficial obtido no evento (estadual, nacional...) — mede as metas 2027
create type public.event_level as enum ('estadual', 'regional', 'nacional', 'outro');

create table public.project_results (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  program_id uuid not null,
  level public.event_level not null,
  event_name text check (length(event_name) <= 160),
  held_on date not null,
  total_score numeric(6,2) check (total_score >= 0 and total_score <= 100),
  innovation_score numeric(6,2) check (innovation_score >= 0 and innovation_score <= 40),
  placement integer check (placement >= 1),
  notes text check (length(notes) <= 2000),
  document_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  constraint project_results_project_fk foreign key (project_id, program_id) references public.projects (id, program_id),
  constraint project_results_document_fk foreign key (document_id, program_id) references public.documents (id, program_id),
  constraint project_results_content_ck check (num_nonnulls(total_score, placement) >= 1)
);
create index project_results_project_idx on public.project_results (project_id, held_on);
create trigger project_results_touch before update on public.project_results for each row execute function private.touch_updated_at();
create trigger project_results_audit after insert or update or delete on public.project_results for each row execute function private.audit();

grant select, insert, update on public.project_results to authenticated;
grant all on public.project_results to service_role;
alter table public.project_results enable row level security;
create policy project_results_select on public.project_results for select to authenticated using (private.project_scope_ok(project_id, false));
create policy project_results_insert on public.project_results for insert to authenticated with check (private.project_scope_ok(project_id, true));
create policy project_results_update on public.project_results for update to authenticated
  using (private.project_scope_ok(project_id, true)) with check (private.project_scope_ok(project_id, true));

revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon;

-- >>>>> supabase/migrations/20261127000100_recursos_orcamento_riscos.sql
-- =============================================================================
-- COMPETE VIX — Etapa 4: Recursos (RF09), Orçamento (RF10), Benchmarking (RF11),
-- Riscos (RF12) e suporte a Relatórios (RF14). PRD §8, §9, §12 (item 4).
-- Aceite: saldo reconciliado (sem dupla contagem), exportação respeita permissões,
-- indicadores reproduzíveis. Aprovação no portal é registro interno: não substitui
-- autorização institucional (PRD §4).
-- =============================================================================

create type public.resource_type as enum ('equipamento', 'ambiente', 'ferramenta', 'insumo', 'software', 'outro');
create type public.resource_condition as enum ('bom', 'regular', 'ruim', 'indisponivel');
create type public.request_status as enum ('rascunho', 'enviada', 'em_analise', 'aprovada', 'rejeitada', 'atendida', 'cancelada');
create type public.budget_category as enum ('insumos', 'equipamentos', 'servicos', 'viagens', 'alimentacao', 'bolsas', 'outros');
create type public.budget_tx_type as enum ('solicitado', 'aprovado', 'comprometido', 'realizado');
create type public.benchmark_status as enum ('planejado', 'realizado', 'cancelado');
create type public.risk_status as enum ('aberto', 'mitigando', 'fechado');

-- Membro com papel de gestão operacional em algum programa da unidade
create or replace function private.member_of_unit(p_unit uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.programs pr
    where pr.unit_id = p_unit and private.has_program_role(pr.id, '{supervisao,gestao,orientador}')
  )
$$;
grant execute on function private.member_of_unit(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RF09 Recursos: inventário por unidade (compartilhado entre programas)
-- ---------------------------------------------------------------------------
create table public.resources (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units (id),
  type public.resource_type not null,
  name text not null check (length(btrim(name)) between 2 and 160),
  asset_code text check (length(asset_code) <= 60),
  quantity numeric(12,2) not null default 1 check (quantity >= 0),
  measure_unit text not null default 'un' check (length(measure_unit) between 1 and 20),
  condition public.resource_condition not null default 'bom',
  location text check (length(location) <= 160),
  availability_note text check (length(availability_note) <= 1000),
  -- Ambientes podem ser reservados na agenda (detecção de conflito)
  bookable boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id)
);
create index resources_unit_idx on public.resources (unit_id, type);

create table public.resource_requests (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null,
  team_id uuid,
  resource_id uuid references public.resources (id),
  title text not null check (length(btrim(title)) between 3 and 200),
  quantity numeric(12,2) not null default 1 check (quantity > 0),
  justification text not null check (length(btrim(justification)) between 3 and 2000),
  needed_by date,
  -- Necessidade a analisar (ex.: movimentação da Smart 4.0 — PRD RF09)
  needs_analysis boolean not null default false,
  -- Recurso bloqueante para o treino/projeto: gera alerta enquanto não atendido
  blocking boolean not null default false,
  status public.request_status not null default 'rascunho',
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  decision_note text check (length(decision_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  constraint resource_requests_team_fk foreign key (team_id, program_id) references public.teams (id, program_id),
  constraint resource_requests_scope_uk unique (id, program_id)
);
create index resource_requests_program_idx on public.resource_requests (program_id, status);

create table public.request_history (
  id bigint generated always as identity primary key,
  request_id uuid not null,
  program_id uuid not null,
  from_status public.request_status,
  to_status public.request_status not null,
  note text check (length(note) <= 2000),
  actor uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint request_history_fk foreign key (request_id, program_id) references public.resource_requests (id, program_id)
);

create table public.resource_movements (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources (id),
  program_id uuid references public.programs (id),
  request_id uuid references public.resource_requests (id),
  from_location text check (length(from_location) <= 160),
  to_location text not null check (length(btrim(to_location)) between 2 and 160),
  quantity numeric(12,2) not null check (quantity > 0),
  moved_on date not null,
  approval_ref text check (length(approval_ref) <= 120),
  note text check (length(note) <= 1000),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id)
);
create index resource_movements_resource_idx on public.resource_movements (resource_id, moved_on);

-- Ambiente reservado no evento da agenda (mesma unidade do programa)
alter table public.events add column resource_id uuid references public.resources (id);
create index events_resource_idx on public.events (resource_id);

create or replace function private.events_resource_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.resource_id is not null and not exists (
    select 1 from public.resources r join public.programs p on p.id = new.program_id
    where r.id = new.resource_id and r.unit_id = p.unit_id and r.bookable and r.archived_at is null
  ) then
    raise exception 'O ambiente deve ser reservável, ativo e da mesma unidade do programa.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger events_resource_guard before insert or update of resource_id on public.events
  for each row execute function private.events_resource_guard();

create or replace function private.resource_requests_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.resource_id is not null and not exists (
    select 1 from public.resources r join public.programs p on p.id = new.program_id
    where r.id = new.resource_id and r.unit_id = p.unit_id
  ) then
    raise exception 'O recurso deve ser da mesma unidade do programa.' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'rascunho' then raise exception 'Solicitação começa em rascunho.' using errcode = 'check_violation'; end if;
    return new;
  end if;
  if new.status is distinct from old.status and current_setting('app.request_flow', true) is distinct from 'on' then
    raise exception 'Use o fluxo da solicitação para mudar o status.' using errcode = 'check_violation';
  end if;
  if old.status <> 'rascunho' and (new.title, new.quantity, new.justification, new.resource_id, new.team_id, new.program_id)
     is distinct from (old.title, old.quantity, old.justification, old.resource_id, old.team_id, old.program_id) then
    raise exception 'Solicitação enviada não pode ser editada.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger resource_requests_guard before insert or update on public.resource_requests
  for each row execute function private.resource_requests_guard();

-- Fluxo (PRD §9): rascunho → enviada → análise → aprovada/rejeitada → atendida/cancelada
create or replace function public.set_request_status(p_request uuid, p_status public.request_status, p_note text default null)
returns public.resource_requests language plpgsql security definer set search_path = '' as $$
declare v public.resource_requests; v_sup boolean; v_mgr boolean; v_ok boolean;
begin
  select * into v from public.resource_requests where id = p_request for update;
  if v.id is null or not private.can_read_scope(v.program_id, v.team_id) then
    raise exception 'Solicitação não encontrada.' using errcode = 'insufficient_privilege';
  end if;
  v_sup := private.has_program_role(v.program_id, '{supervisao}');
  v_mgr := private.can_manage_scope(v.program_id, v.team_id);
  v_ok := case
    when v.status = 'rascunho' and p_status = 'enviada' then v_mgr
    when v.status = 'enviada' and p_status = 'em_analise' then v_sup
    when v.status in ('enviada', 'em_analise') and p_status in ('aprovada', 'rejeitada') then v_sup
    when v.status = 'aprovada' and p_status = 'atendida' then v_sup
    when v.status in ('rascunho', 'enviada', 'em_analise', 'aprovada') and p_status = 'cancelada' then v_mgr
    else null
  end;
  if v_ok is null then
    raise exception 'Transição não permitida: % → %.', v.status, p_status using errcode = 'check_violation';
  end if;
  if not v_ok then
    raise exception 'Seu papel não permite esta decisão.' using errcode = 'insufficient_privilege';
  end if;
  if p_status in ('rejeitada', 'cancelada') and nullif(btrim(p_note), '') is null then
    raise exception 'Informe o motivo.' using errcode = 'check_violation';
  end if;
  insert into public.request_history (request_id, program_id, from_status, to_status, note)
  values (v.id, v.program_id, v.status, p_status, nullif(btrim(p_note), ''));
  perform set_config('app.request_flow', 'on', true);
  update public.resource_requests set
    status = p_status,
    decided_by = case when p_status in ('aprovada', 'rejeitada') then auth.uid() else decided_by end,
    decided_at = case when p_status in ('aprovada', 'rejeitada') then now() else decided_at end,
    decision_note = case when p_status in ('aprovada', 'rejeitada') then nullif(btrim(p_note), '') else decision_note end
  where id = v.id returning * into v;
  perform set_config('app.request_flow', '', true);
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- RF10 Orçamento
-- ---------------------------------------------------------------------------
create table public.budget_items (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id),
  category public.budget_category not null,
  description text not null check (length(btrim(description)) between 3 and 300),
  estimated numeric(14,2) not null default 0 check (estimated >= 0),
  request_id uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  constraint budget_items_scope_uk unique (id, program_id),
  constraint budget_items_request_fk foreign key (request_id, program_id) references public.resource_requests (id, program_id)
);
create index budget_items_program_idx on public.budget_items (program_id);

create table public.budget_transactions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null,
  program_id uuid not null,
  type public.budget_tx_type not null,
  amount numeric(14,2) not null check (amount > 0),
  occurred_on date not null,
  -- Vínculo que impede dupla contagem: realizado → comprometido que ele consome
  parent_id uuid,
  approval_ref text check (length(approval_ref) <= 120),
  document_id uuid,
  note text check (length(note) <= 1000),
  -- Correção sem apagar: cancelamento lógico com justificativa
  cancelled_at timestamptz,
  cancel_note text check (length(cancel_note) <= 1000),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  constraint budget_tx_item_fk foreign key (item_id, program_id) references public.budget_items (id, program_id),
  constraint budget_tx_scope_uk unique (id, program_id),
  constraint budget_tx_parent_fk foreign key (parent_id, program_id) references public.budget_transactions (id, program_id),
  constraint budget_tx_document_fk foreign key (document_id, program_id) references public.documents (id, program_id),
  constraint budget_tx_cancel_ck check (cancelled_at is null or cancel_note is not null)
);
create index budget_tx_item_idx on public.budget_transactions (item_id);

create or replace function private.budget_tx_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_parent public.budget_transactions; v_used numeric;
begin
  if tg_op = 'UPDATE' then
    if (new.item_id, new.type, new.amount, new.occurred_on, new.parent_id, new.program_id)
       is distinct from (old.item_id, old.type, old.amount, old.occurred_on, old.parent_id, old.program_id) then
      raise exception 'Lançamento é imutável; cancele com justificativa e lance de novo.' using errcode = 'check_violation';
    end if;
    if old.cancelled_at is not null and new.cancelled_at is distinct from old.cancelled_at then
      raise exception 'Cancelamento não pode ser desfeito.' using errcode = 'check_violation';
    end if;
    if new.cancelled_at is not null and old.cancelled_at is null and old.type = 'comprometido' and exists (
      select 1 from public.budget_transactions r where r.parent_id = old.id and r.cancelled_at is null
    ) then
      raise exception 'Compromisso com realizado vinculado não pode ser cancelado.' using errcode = 'check_violation';
    end if;
    return new;
  end if;
  if new.parent_id is not null then
    if new.type <> 'realizado' then
      raise exception 'Só lançamentos realizados se vinculam a um compromisso.' using errcode = 'check_violation';
    end if;
    select * into v_parent from public.budget_transactions where id = new.parent_id;
    if v_parent.type <> 'comprometido' or v_parent.item_id <> new.item_id or v_parent.cancelled_at is not null then
      raise exception 'O vínculo deve ser um compromisso ativo do mesmo item.' using errcode = 'check_violation';
    end if;
    select coalesce(sum(amount), 0) into v_used from public.budget_transactions
    where parent_id = new.parent_id and cancelled_at is null;
    if v_used + new.amount > v_parent.amount then
      raise exception 'Realizado (% + %) excede o compromisso vinculado (%).', v_used, new.amount, v_parent.amount using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
create trigger budget_tx_guard before insert or update on public.budget_transactions
  for each row execute function private.budget_tx_guard();

-- Resumo por item (security_invoker: respeita o RLS). Saldo = aprovado − compromissos em aberto − realizado.
create view public.budget_item_summary with (security_invoker = true) as
with t as (
  select * from public.budget_transactions where cancelled_at is null
), commit_open as (
  select c.item_id, sum(greatest(c.amount - coalesce((select sum(r.amount) from t r where r.parent_id = c.id), 0), 0)) as open_commit
  from t c where c.type = 'comprometido' group by c.item_id
)
select i.id as item_id, i.program_id, i.category, i.description, i.estimated, i.archived_at,
  coalesce(sum(t.amount) filter (where t.type = 'solicitado'), 0)::numeric(14,2) as requested,
  coalesce(sum(t.amount) filter (where t.type = 'aprovado'), 0)::numeric(14,2) as approved,
  coalesce(sum(t.amount) filter (where t.type = 'comprometido'), 0)::numeric(14,2) as committed,
  coalesce(sum(t.amount) filter (where t.type = 'realizado'), 0)::numeric(14,2) as realized,
  coalesce(max(co.open_commit), 0)::numeric(14,2) as open_commitments,
  (coalesce(sum(t.amount) filter (where t.type = 'aprovado'), 0)
    - coalesce(max(co.open_commit), 0)
    - coalesce(sum(t.amount) filter (where t.type = 'realizado'), 0))::numeric(14,2) as balance
from public.budget_items i
left join t on t.item_id = i.id
left join commit_open co on co.item_id = i.id
group by i.id;

-- ---------------------------------------------------------------------------
-- RF11 Benchmarking
-- ---------------------------------------------------------------------------
create table public.benchmarks (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id),
  reference text not null check (length(btrim(reference)) between 2 and 200),
  contact text check (length(contact) <= 200),
  objective text not null check (length(btrim(objective)) between 3 and 2000),
  scheduled_on date,
  status public.benchmark_status not null default 'planejado',
  findings text check (length(findings) <= 8000),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  constraint benchmarks_scope_uk unique (id, program_id),
  constraint benchmarks_done_ck check (status <> 'realizado' or findings is not null)
);
create index benchmarks_program_idx on public.benchmarks (program_id);

create table public.benchmark_actions (
  benchmark_id uuid not null,
  action_id uuid not null,
  program_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (benchmark_id, action_id),
  constraint benchmark_actions_b_fk foreign key (benchmark_id, program_id) references public.benchmarks (id, program_id),
  constraint benchmark_actions_a_fk foreign key (action_id, program_id) references public.actions (id, program_id)
);

-- ---------------------------------------------------------------------------
-- RF12 Riscos
-- ---------------------------------------------------------------------------
create table public.risks (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id),
  team_id uuid,
  title text not null check (length(btrim(title)) between 3 and 200),
  description text check (length(description) <= 2000),
  category text check (length(category) <= 60),
  probability smallint not null check (probability between 1 and 5),
  impact smallint not null check (impact between 1 and 5),
  score smallint generated always as (probability * impact) stored,
  mitigation text check (length(mitigation) <= 2000),
  owner_person_id uuid references public.people (id),
  due_date date,
  next_review date,
  status public.risk_status not null default 'aberto',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  constraint risks_team_fk foreign key (team_id, program_id) references public.teams (id, program_id),
  constraint risks_scope_uk unique (id, program_id),
  constraint risks_closed_ck check (status <> 'fechado' or mitigation is not null)
);
create index risks_program_idx on public.risks (program_id, status);

create table public.risk_reviews (
  id bigint generated always as identity primary key,
  risk_id uuid not null,
  program_id uuid not null,
  probability smallint not null,
  impact smallint not null,
  status public.risk_status not null,
  note text check (length(note) <= 2000),
  reviewed_by uuid default auth.uid() references public.profiles (id),
  reviewed_at timestamptz not null default now(),
  constraint risk_reviews_fk foreign key (risk_id, program_id) references public.risks (id, program_id)
);
create index risk_reviews_risk_idx on public.risk_reviews (risk_id, reviewed_at);

-- Toda criação/reavaliação gera histórico (com a nota informada em app.risk_note)
create or replace function private.risks_history() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_person_visible(new.owner_person_id);
  if tg_op = 'INSERT' or (new.probability, new.impact, new.status) is distinct from (old.probability, old.impact, old.status) then
    insert into public.risk_reviews (risk_id, program_id, probability, impact, status, note)
    values (new.id, new.program_id, new.probability, new.impact, new.status, nullif(btrim(current_setting('app.risk_note', true)), ''));
  end if;
  return new;
end $$;
create trigger risks_history after insert or update on public.risks for each row execute function private.risks_history();

-- touch
create trigger resources_touch before update on public.resources for each row execute function private.touch_updated_at();
create trigger resource_requests_touch before update on public.resource_requests for each row execute function private.touch_updated_at();
create trigger budget_items_touch before update on public.budget_items for each row execute function private.touch_updated_at();
create trigger benchmarks_touch before update on public.benchmarks for each row execute function private.touch_updated_at();
create trigger risks_touch before update on public.risks for each row execute function private.touch_updated_at();

do $$
declare t text;
begin
  foreach t in array array['resources', 'resource_requests', 'resource_movements', 'budget_items', 'budget_transactions', 'benchmarks', 'risks'] loop
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each row execute function private.audit()', t || '_audit', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
grant select, insert, update on public.resources, public.resource_requests, public.resource_movements, public.budget_items,
  public.budget_transactions, public.benchmarks, public.risks to authenticated;
grant select, insert, delete on public.benchmark_actions to authenticated;
grant select on public.request_history, public.risk_reviews, public.budget_item_summary to authenticated;
grant all on public.resources, public.resource_requests, public.request_history, public.resource_movements, public.budget_items,
  public.budget_transactions, public.benchmarks, public.benchmark_actions, public.risks, public.risk_reviews to service_role;

alter table public.resources enable row level security;
alter table public.resource_requests enable row level security;
alter table public.request_history enable row level security;
alter table public.resource_movements enable row level security;
alter table public.budget_items enable row level security;
alter table public.budget_transactions enable row level security;
alter table public.benchmarks enable row level security;
alter table public.benchmark_actions enable row level security;
alter table public.risks enable row level security;
alter table public.risk_reviews enable row level security;

-- Inventário: equipe gestora da unidade lê; supervisão da unidade mantém
create policy resources_select on public.resources for select to authenticated using (private.member_of_unit(unit_id));
create policy resources_insert on public.resources for insert to authenticated with check (private.supervises_unit(unit_id));
create policy resources_update on public.resources for update to authenticated
  using (private.supervises_unit(unit_id)) with check (private.supervises_unit(unit_id));

create policy resource_requests_select on public.resource_requests for select to authenticated using (private.can_read_scope(program_id, team_id));
create policy resource_requests_insert on public.resource_requests for insert to authenticated with check (private.can_manage_scope(program_id, team_id));
create policy resource_requests_update on public.resource_requests for update to authenticated
  using (private.can_manage_scope(program_id, team_id)) with check (private.can_manage_scope(program_id, team_id));

create policy request_history_select on public.request_history for select to authenticated using (
  exists (select 1 from public.resource_requests r where r.id = request_id and private.can_read_scope(r.program_id, r.team_id))
);

create policy resource_movements_select on public.resource_movements for select to authenticated using (
  exists (select 1 from public.resources r where r.id = resource_id and private.member_of_unit(r.unit_id))
);
create policy resource_movements_insert on public.resource_movements for insert to authenticated with check (
  exists (select 1 from public.resources r where r.id = resource_id and private.supervises_unit(r.unit_id))
);

-- Orçamento: sensível — supervisão e gestão leem; supervisão lança; gestão registra aprovações (delegação)
create policy budget_items_select on public.budget_items for select to authenticated using (private.has_program_role(program_id, '{supervisao,gestao}'));
create policy budget_items_insert on public.budget_items for insert to authenticated with check (private.has_program_role(program_id, '{supervisao}'));
create policy budget_items_update on public.budget_items for update to authenticated
  using (private.has_program_role(program_id, '{supervisao}')) with check (private.has_program_role(program_id, '{supervisao}'));

create policy budget_tx_select on public.budget_transactions for select to authenticated using (private.has_program_role(program_id, '{supervisao,gestao}'));
create policy budget_tx_insert on public.budget_transactions for insert to authenticated with check (
  (private.has_program_role(program_id, '{supervisao}') or (type = 'aprovado' and private.has_program_role(program_id, '{gestao}')))
  and (document_id is null or private.can_read_document(document_id))
);
create policy budget_tx_update on public.budget_transactions for update to authenticated
  using (private.has_program_role(program_id, '{supervisao}')) with check (private.has_program_role(program_id, '{supervisao}'));

create policy benchmarks_select on public.benchmarks for select to authenticated using (private.can_read_scope(program_id, null));
create policy benchmarks_insert on public.benchmarks for insert to authenticated with check (private.has_program_role(program_id, '{supervisao}'));
create policy benchmarks_update on public.benchmarks for update to authenticated
  using (private.has_program_role(program_id, '{supervisao}')) with check (private.has_program_role(program_id, '{supervisao}'));
create policy benchmark_actions_select on public.benchmark_actions for select to authenticated using (private.can_read_scope(program_id, null));
create policy benchmark_actions_insert on public.benchmark_actions for insert to authenticated with check (private.has_program_role(program_id, '{supervisao}'));
create policy benchmark_actions_delete on public.benchmark_actions for delete to authenticated using (private.has_program_role(program_id, '{supervisao}'));

create policy risks_select on public.risks for select to authenticated using (private.can_read_scope(program_id, team_id));
create policy risks_insert on public.risks for insert to authenticated with check (private.can_manage_scope(program_id, team_id));
create policy risks_update on public.risks for update to authenticated
  using (private.can_manage_scope(program_id, team_id)) with check (private.can_manage_scope(program_id, team_id));
create policy risk_reviews_select on public.risk_reviews for select to authenticated using (
  exists (select 1 from public.risks r where r.id = risk_id and private.can_read_scope(r.program_id, r.team_id))
);

-- Reavaliação de risco com nota, numa transação
create or replace function public.review_risk(p_risk uuid, p_probability smallint, p_impact smallint, p_status public.risk_status, p_note text default null)
returns public.risks language plpgsql security invoker set search_path = '' as $$
declare v public.risks;
begin
  perform set_config('app.risk_note', coalesce(p_note, ''), true);
  update public.risks set probability = p_probability, impact = p_impact, status = p_status where id = p_risk returning * into v;
  perform set_config('app.risk_note', '', true);
  if v.id is null then raise exception 'Risco não encontrado ou sem permissão.' using errcode = 'insufficient_privilege'; end if;
  return v;
end $$;

revoke execute on function public.set_request_status(uuid, public.request_status, text), public.review_risk(uuid, smallint, smallint, public.risk_status, text) from public, anon;
grant execute on function public.set_request_status(uuid, public.request_status, text), public.review_risk(uuid, smallint, smallint, public.risk_status, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Alertas: recurso bloqueante pendente; risco crítico sem revisão em dia
-- ---------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_rule_check;
alter table public.notifications add constraint notifications_rule_check
  check (rule in ('acao_vencida', 'checklist_pendente', 'relatorio_nao_enviado', 'nota_abaixo_rampa', 'recurso_bloqueante', 'risco_critico'));

create or replace function public.refresh_alerts_ops()
returns table (created integer, resolved integer)
language plpgsql security definer set search_path = '' as $$
declare v_created int := 0; v_resolved int := 0; v_n int;
begin
  insert into public.notifications (user_id, program_id, rule, entity_table, entity_id, period_key, title, link, dedupe_key)
  select s, r.program_id, 'recurso_bloqueante', 'resource_requests', r.id, coalesce(r.needed_by::text, '-'),
         'Recurso bloqueante pendente: ' || r.title, '/recursos?programa=' || r.program_id,
         'recurso_bloqueante:' || r.id || ':' || s
  from public.resource_requests r
  cross join lateral private.program_supervisors(r.program_id) s
  where r.blocking and r.status in ('enviada', 'em_analise', 'aprovada')
  on conflict (dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_created := v_created + v_n;

  insert into public.notifications (user_id, program_id, rule, entity_table, entity_id, period_key, title, link, dedupe_key)
  select s, k.program_id, 'risco_critico', 'risks', k.id, coalesce(k.next_review::text, '-'),
         'Risco crítico (' || k.score || ') com revisão vencida: ' || k.title, '/riscos?programa=' || k.program_id,
         'risco_critico:' || k.id || ':' || coalesce(k.next_review::text, '-') || ':' || s
  from public.risks k
  cross join lateral private.program_supervisors(k.program_id) s
  where k.archived_at is null and k.status <> 'fechado' and k.score >= 15
    and (k.next_review is null or k.next_review < private.today())
  on conflict (dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_created := v_created + v_n;

  update public.notifications n set resolved_at = now()
  where n.resolved_at is null and n.rule = 'recurso_bloqueante'
    and not exists (select 1 from public.resource_requests r where r.id = n.entity_id and r.blocking and r.status in ('enviada', 'em_analise', 'aprovada'));
  get diagnostics v_n = row_count; v_resolved := v_resolved + v_n;

  update public.notifications n set resolved_at = now()
  where n.resolved_at is null and n.rule = 'risco_critico'
    and not exists (select 1 from public.risks k where k.id = n.entity_id and k.archived_at is null and k.status <> 'fechado'
                    and k.score >= 15 and (k.next_review is null or k.next_review < private.today()));
  get diagnostics v_n = row_count; v_resolved := v_resolved + v_n;
  return query select v_created, v_resolved;
end $$;
revoke execute on function public.refresh_alerts_ops() from public, anon, authenticated;
grant execute on function public.refresh_alerts_ops() to service_role;

revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon;

-- >>>>> supabase/migrations/20261128000100_calendario_cadencias.sql
-- =============================================================================
-- COMPETE VIX — Etapa 4.1: calendário de dias não úteis e cadências configuráveis (RF15)
-- - calendar_days: feriados/recessos globais (todas as unidades) ou por unidade.
--   Dias com affects_ch = true saem do previsto da CH (PRD §6: calendário real).
-- - programs.settings: cadências de simulado, prazo do fechamento semanal e alerta de CH.
--   Sem configuração, os alertas correspondentes ficam DESLIGADOS (não presumir decisões — PRD §14).
-- =============================================================================

create type public.calendar_kind as enum ('feriado_nacional', 'feriado_estadual', 'feriado_municipal', 'recesso', 'ponto_facultativo', 'outro');

create table public.calendar_days (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid references public.units (id),
  day date not null,
  kind public.calendar_kind not null,
  description text not null check (length(btrim(description)) between 2 and 160),
  affects_ch boolean not null default true,
  source text check (length(source) <= 300),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  constraint calendar_days_uk unique nulls not distinct (unit_id, day)
);
create index calendar_days_day_idx on public.calendar_days (day);
create trigger calendar_days_audit after insert or update or delete on public.calendar_days for each row execute function private.audit();

grant select, insert, update, delete on public.calendar_days to authenticated;
grant all on public.calendar_days to service_role;
alter table public.calendar_days enable row level security;
create policy calendar_days_select on public.calendar_days for select to authenticated using (private.is_active_user());
create policy calendar_days_write on public.calendar_days for all to authenticated
  using (private.is_admin() or (unit_id is not null and private.supervises_unit(unit_id)))
  with check (private.is_admin() or (unit_id is not null and private.supervises_unit(unit_id)));

-- Dia útil para a CH: seg–sex e não marcado no calendário (global ou da unidade) com affects_ch
create or replace function private.is_working_day(p_day date, p_unit uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select extract(isodow from p_day) between 1 and 5
     and not exists (select 1 from public.calendar_days c where c.day = p_day and c.affects_ch and (c.unit_id is null or c.unit_id = p_unit))
$$;

-- CH de uma equipe num período (mesma regra de chByPerson/plannedMinutes no TypeScript;
-- arredondamento por alocação). Usada pelos alertas.
create or replace function private.team_ch(p_team uuid, p_start date, p_end date)
returns table (planned integer, effective integer)
language sql stable security definer set search_path = '' as $$
  with t as (
    select tm.id, tm.program_id, pr.unit_id from public.teams tm join public.programs pr on pr.id = tm.program_id where tm.id = p_team
  ), alloc as (
    select a.planned_weekly_minutes,
           greatest(a.valid_from, p_start) as f,
           least(coalesce(a.valid_to, p_end), p_end) as l
    from public.allocations a, t where a.team_id = t.id
  ), plan as (
    select coalesce(sum(round(al.planned_weekly_minutes / 5.0 *
             (select count(*) from generate_series(al.f, al.l, interval '1 day') d, t where private.is_working_day(d::date, t.unit_id)))), 0)::int as planned
    from alloc al where al.f <= al.l
  ), eff as (
    select coalesce(sum(att.attended_minutes), 0)::int as effective
    from public.training_sessions s join public.attendance att on att.session_id = s.id, t
    where s.team_id = t.id and (s.starts_at at time zone 'America/Sao_Paulo')::date between p_start and p_end
  )
  select plan.planned, eff.effective from plan, eff
$$;
grant execute on function private.is_working_day(date, uuid), private.team_ch(uuid, date, date) to authenticated;

alter table public.notifications drop constraint notifications_rule_check;
alter table public.notifications add constraint notifications_rule_check
  check (rule in ('acao_vencida', 'checklist_pendente', 'relatorio_nao_enviado', 'nota_abaixo_rampa',
                  'recurso_bloqueante', 'risco_critico', 'ch_abaixo_meta', 'simulado_ausente'));

-- Fechamento semanal: alerta só depois do prazo configurado (padrão: 1 dia após o domingo)
create or replace function public.refresh_alerts_ws()
returns table (created integer, resolved integer)
language plpgsql security definer set search_path = '' as $$
declare v_created int := 0; v_resolved int := 0; v_n int;
  v_last_week date := (date_trunc('week', private.today()) - interval '7 days')::date;
begin
  insert into public.notifications (user_id, program_id, rule, entity_table, entity_id, period_key, title, link, dedupe_key)
  select s, t.program_id, 'relatorio_nao_enviado', 'teams', t.id, v_last_week::text,
         'Fechamento semanal não enviado: ' || t.name || ' (semana de ' || to_char(v_last_week, 'DD/MM') || ')',
         '/acompanhamentos?programa=' || t.program_id,
         'relatorio_nao_enviado:' || t.id || ':' || v_last_week || ':' || s
  from public.teams t
  join public.programs pg on pg.id = t.program_id
  cross join lateral private.program_supervisors(t.program_id) s
  where t.archived_at is null
    and private.today() > v_last_week + 6 + coalesce((pg.settings ->> 'fechamento_prazo_dias')::int, 1)
    and exists (select 1 from public.training_plans p where p.team_id = t.id and p.status = 'publicado'
                and p.period_start <= v_last_week + 6 and p.period_end >= v_last_week)
    and not exists (select 1 from public.weekly_reports r where r.team_id = t.id and r.week_start = v_last_week and r.status <> 'rascunho')
  on conflict (dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_created := v_created + v_n;

  insert into public.notifications (user_id, program_id, rule, entity_table, entity_id, period_key, title, link, dedupe_key)
  select s, a.program_id, 'nota_abaixo_rampa', 'assessments', a.id, a.held_on::text,
         'Simulado abaixo da rampa: ' || a.title || ' (' || r.score || ' < ' || st.target || ')',
         '/worldskills/simulados/' || a.id,
         'nota_abaixo_rampa:' || a.id || ':' || s
  from public.assessments a
  join public.assessment_results r on r.assessment_id = a.id and r.person_id is null and r.criterion is null
  join public.score_targets st on st.occupation_id = a.occupation_id and st.scale = a.scale
       and st.month = date_trunc('month', a.held_on)::date
  cross join lateral private.program_supervisors(a.program_id) s
  where a.status = 'publicado' and r.score < st.target
  on conflict (dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_created := v_created + v_n;

  update public.notifications n set resolved_at = now()
  where n.resolved_at is null and n.rule = 'relatorio_nao_enviado'
    and exists (select 1 from public.weekly_reports r where r.team_id = n.entity_id and r.week_start::text = n.period_key and r.status <> 'rascunho');
  get diagnostics v_n = row_count; v_resolved := v_resolved + v_n;
  return query select v_created, v_resolved;
end $$;

-- Alertas por cadência configurada: CH abaixo de 95% na semana anterior; simulado ausente no período anterior
create or replace function public.refresh_alerts_cadence()
returns table (created integer, resolved integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_created int := 0; v_resolved int := 0; v_n int;
  v_week date := (date_trunc('week', private.today()) - interval '7 days')::date;
  v_fortnight date := (date_trunc('week', private.today()) - interval '14 days')::date;
  v_month date := (date_trunc('month', private.today()) - interval '1 month')::date;
  v_quarter date := (date_trunc('quarter', private.today()) - interval '3 months')::date;
begin
  -- Equipes em treino ativo (plano publicado cobrindo o período) de programas configurados
  create temporary table if not exists cv_targets (team_id uuid, program_id uuid, team_name text, kind text, p_start date, p_end date, settings jsonb) on commit drop;
  truncate cv_targets;
  insert into cv_targets
  select t.id, t.program_id, t.name, x.kind, x.p_start, x.p_end, pg.settings
  from public.teams t
  join public.programs pg on pg.id = t.program_id
  cross join lateral (values
    ('ch', v_week, v_week + 6, (pg.settings ->> 'alerta_ch') = 'true'),
    ('parcial', case when pg.settings ->> 'simulado_parcial' = 'quinzenal' then v_fortnight else v_week end, v_week + 6, pg.settings ->> 'simulado_parcial' in ('semanal', 'quinzenal')),
    ('completo', case when pg.settings ->> 'simulado_completo' = 'semanal' then v_week else v_month end,
                 case when pg.settings ->> 'simulado_completo' = 'semanal' then v_week + 6 else (v_month + interval '1 month' - interval '1 day')::date end,
                 pg.settings ->> 'simulado_completo' in ('semanal', 'mensal')),
    ('externo', v_quarter, (v_quarter + interval '3 months' - interval '1 day')::date, pg.settings ->> 'simulado_externo' = 'trimestral')
  ) x(kind, p_start, p_end, enabled)
  where t.archived_at is null and x.enabled
    and exists (select 1 from public.training_plans p where p.team_id = t.id and p.status = 'publicado'
                and p.period_start <= x.p_end and p.period_end >= x.p_start);

  insert into public.notifications (user_id, program_id, rule, entity_table, entity_id, period_key, title, link, dedupe_key)
  select s, c.program_id, 'ch_abaixo_meta', 'teams', c.team_id, c.p_start::text,
         'CH abaixo de 95%: ' || c.team_name || ' (semana de ' || to_char(c.p_start, 'DD/MM') || ': ' || round(ch.effective * 100.0 / ch.planned, 1) || '%)',
         '/worldskills?programa=' || c.program_id || '&semana=' || c.p_start,
         'ch_abaixo_meta:' || c.team_id || ':' || c.p_start || ':' || s
  from cv_targets c
  cross join lateral private.team_ch(c.team_id, c.p_start, c.p_end) ch
  cross join lateral private.program_supervisors(c.program_id) s
  where c.kind = 'ch' and ch.planned > 0 and ch.effective * 100 < 95 * ch.planned
  on conflict (dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_created := v_created + v_n;

  insert into public.notifications (user_id, program_id, rule, entity_table, entity_id, period_key, title, link, dedupe_key)
  select s, c.program_id, 'simulado_ausente', 'teams', c.team_id, c.kind || ':' || c.p_start,
         'Simulado ' || c.kind || ' não registrado: ' || c.team_name || ' (' || to_char(c.p_start, 'DD/MM') || '–' || to_char(c.p_end, 'DD/MM') || ')',
         '/worldskills?programa=' || c.program_id || '&aba=simulados',
         'simulado_ausente:' || c.team_id || ':' || c.kind || ':' || c.p_start || ':' || s
  from cv_targets c
  cross join lateral private.program_supervisors(c.program_id) s
  where c.kind in ('parcial', 'completo', 'externo')
    and not exists (select 1 from public.assessments a where a.team_id = c.team_id and a.type::text = c.kind
                    and a.status = 'publicado' and a.held_on between c.p_start and c.p_end)
  on conflict (dedupe_key) do nothing;
  get diagnostics v_n = row_count; v_created := v_created + v_n;

  -- Resolver: CH corrigida ou simulado lançado depois
  update public.notifications n set resolved_at = now()
  where n.resolved_at is null and n.rule = 'ch_abaixo_meta'
    and exists (select 1 from private.team_ch(n.entity_id, n.period_key::date, n.period_key::date + 6) ch
                where ch.planned = 0 or ch.effective * 100 >= 95 * ch.planned);
  get diagnostics v_n = row_count; v_resolved := v_resolved + v_n;

  update public.notifications n set resolved_at = now()
  where n.resolved_at is null and n.rule = 'simulado_ausente'
    and exists (select 1 from public.assessments a where a.team_id = n.entity_id and a.status = 'publicado'
                and a.type::text = split_part(n.period_key, ':', 1) and a.held_on >= split_part(n.period_key, ':', 2)::date);
  get diagnostics v_n = row_count; v_resolved := v_resolved + v_n;
  return query select v_created, v_resolved;
end $$;
revoke execute on function public.refresh_alerts_cadence() from public, anon, authenticated;
grant execute on function public.refresh_alerts_cadence() to service_role;

revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon;

-- >>>>> supabase/migrations/20261129000100_workflow_acoes.sql
-- =============================================================================
-- COMPETE VIX — Workflow de ações com validação + tema (decisão da supervisão, 25/11/2026)
-- Etapas: A fazer → Em andamento → Em validação → Concluída (supervisão aprova ou devolve).
-- "Em validação" = status em_andamento + validation_requested_at (evita alterar o enum,
-- permitindo aplicar tudo num único SQL). "Bloqueada" passa a ser um SINAL (blocked) com motivo.
-- FRC, Giaffone e E-Kart ficam em standby (active = false), sem apagar nada.
-- =============================================================================

create type public.action_theme as enum ('treino', 'infraestrutura', 'compras', 'pessoas', 'eventos', 'gestao', 'outro');

alter table public.actions
  add column theme public.action_theme,
  add column blocked boolean not null default false,
  add column validation_requested_at timestamptz,
  add column validation_requested_by uuid references public.profiles (id),
  add column validated_at timestamptz,
  add column validated_by uuid references public.profiles (id);
alter table public.actions add constraint actions_blocked_reason_ck check (not blocked or blocked_reason is not null);
create index actions_theme_idx on public.actions (program_id, theme);

-- Ações legadas "bloqueadas" viram "em andamento" com sinal de bloqueio (motivo preservado)
alter table public.actions disable trigger actions_guard;
alter table public.actions disable trigger actions_history;
update public.actions set status = 'em_andamento', blocked = true where status = 'bloqueada';
alter table public.actions enable trigger actions_guard;
alter table public.actions enable trigger actions_history;

-- Requisitos para concluir (ou enviar à validação): dependências, evidência, regra do programa
create or replace function private.action_completion_check(p public.actions) returns void
language plpgsql stable security definer set search_path = '' as $$
declare v_rule text; v_evidences int; v_pending int;
begin
  select count(*) into v_pending from public.action_dependencies d join public.actions a on a.id = d.depends_on_id
  where d.action_id = p.id and a.status not in ('concluida', 'cancelada');
  if v_pending > 0 then
    raise exception 'Existem % dependência(s) não concluída(s).', v_pending using errcode = 'check_violation';
  end if;
  select coalesce(pr.settings ->> 'acao_conclusao_exige', 'nada') into v_rule from public.programs pr where pr.id = p.program_id;
  select count(*) into v_evidences from public.action_evidences e where e.action_id = p.id;
  if p.requires_evidence and v_evidences = 0 then
    raise exception 'Esta ação exige evidência para conclusão.' using errcode = 'check_violation';
  end if;
  if v_rule = 'nota' and nullif(btrim(p.completion_note), '') is null then
    raise exception 'O programa exige justificativa de conclusão.' using errcode = 'check_violation';
  elsif v_rule = 'evidencia' and v_evidences = 0 then
    raise exception 'O programa exige evidência para conclusão.' using errcode = 'check_violation';
  elsif v_rule = 'nota_ou_evidencia' and v_evidences = 0 and nullif(btrim(p.completion_note), '') is null then
    raise exception 'O programa exige justificativa ou evidência para conclusão.' using errcode = 'check_violation';
  end if;
end $$;

create or replace function private.action_transition_allowed(p_from public.action_status, p_to public.action_status)
returns boolean language plpgsql immutable set search_path = '' as $$
begin
  return p_from = p_to or (p_from::text, p_to::text) in (
    ('aberta', 'em_andamento'), ('aberta', 'concluida'), ('aberta', 'cancelada'),
    ('em_andamento', 'aberta'), ('em_andamento', 'concluida'), ('em_andamento', 'cancelada'),
    -- legado
    ('bloqueada', 'aberta'), ('bloqueada', 'em_andamento'), ('bloqueada', 'cancelada'),
    -- reabertura (justificativa obrigatória)
    ('concluida', 'em_andamento'), ('concluida', 'aberta'), ('cancelada', 'aberta')
  );
end $$;

create or replace function private.actions_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_reason text := nullif(btrim(current_setting('app.status_note', true)), '');
  v_flow text := coalesce(current_setting('app.action_flow', true), '');
  v_sup boolean := auth.uid() is null or private.has_program_role(new.program_id, '{supervisao}');
begin
  perform private.assert_person_visible(new.owner_person_id);

  if tg_op = 'INSERT' then
    if new.status not in ('aberta', 'em_andamento') then
      raise exception 'Ação nova deve começar em “A fazer” ou “Em andamento”.' using errcode = 'check_violation';
    end if;
    if new.validation_requested_at is not null or new.validated_at is not null then
      raise exception 'Validação só pelo fluxo.' using errcode = 'check_violation';
    end if;
    if new.blocked and new.blocked_reason is null then
      raise exception 'Informe o motivo do bloqueio.' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if new.program_id <> old.program_id then
    raise exception 'A ação não pode mudar de programa.' using errcode = 'check_violation';
  end if;
  if new.status = 'bloqueada' and old.status <> 'bloqueada' then
    raise exception 'Use o sinal de bloqueio (o status “bloqueada” foi descontinuado).' using errcode = 'check_violation';
  end if;
  if old.status in ('concluida', 'cancelada') and new.status = old.status
     and (new.title, new.description, new.owner_person_id, new.due_date, new.priority, new.team_id, new.theme)
         is distinct from (old.title, old.description, old.owner_person_id, old.due_date, old.priority, old.team_id, old.theme) then
    raise exception 'Ação encerrada não pode ser editada; reabra com justificativa.' using errcode = 'check_violation';
  end if;
  if not private.action_transition_allowed(old.status, new.status) then
    raise exception 'Transição de status não permitida.' using errcode = 'check_violation';
  end if;
  if old.status in ('concluida', 'cancelada') and new.status not in ('concluida', 'cancelada') and v_reason is null then
    raise exception 'Reabertura exige justificativa.' using errcode = 'check_violation';
  end if;

  -- Campos de validação só mudam pelo fluxo
  if (new.validation_requested_at, new.validation_requested_by, new.validated_at, new.validated_by)
     is distinct from (old.validation_requested_at, old.validation_requested_by, old.validated_at, old.validated_by)
     and v_flow not in ('validar', 'concluir', 'devolver') then
    raise exception 'Use o fluxo de validação.' using errcode = 'check_violation';
  end if;

  -- Envio para validação: confere requisitos já no envio
  if v_flow = 'validar' then
    perform private.action_completion_check(new);
  end if;

  -- Concluir: somente supervisão (quem executa envia para validação)
  if new.status = 'concluida' and old.status <> 'concluida' then
    if not v_sup then
      raise exception 'Envie para validação: a conclusão é feita pela supervisão.' using errcode = 'insufficient_privilege';
    end if;
    perform private.action_completion_check(new);
    new.completed_at := now();
    new.completed_by := auth.uid();
    new.validated_at := now();
    new.validated_by := auth.uid();
  elsif new.status <> 'concluida' then
    new.completed_at := null;
    new.completed_by := null;
    if old.status = 'concluida' then new.validated_at := null; new.validated_by := null; end if;
  end if;

  -- Devolver da validação: só supervisão, com orientação
  if v_flow = 'devolver' then
    if not v_sup then raise exception 'Somente a supervisão devolve ações.' using errcode = 'insufficient_privilege'; end if;
    if v_reason is null then raise exception 'Devolução exige orientação.' using errcode = 'check_violation'; end if;
  end if;

  -- Sair de “em andamento” limpa o pedido de validação; encerrar limpa o bloqueio
  if new.status <> 'em_andamento' then
    new.validation_requested_at := null;
    new.validation_requested_by := null;
  end if;
  if new.status in ('concluida', 'cancelada') or new.validation_requested_at is not null then
    new.blocked := false;
  end if;
  if new.blocked and new.blocked_reason is null then
    raise exception 'Informe o motivo do bloqueio.' using errcode = 'check_violation';
  end if;
  if not new.blocked and new.status <> 'bloqueada' then
    new.blocked_reason := null;
  end if;
  return new;
end $$;

-- Histórico: inclui etapa de validação e bloqueio
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
    values (new.id, new.program_id, 'status', old.status, new.status, coalesce(v_note, case when new.status = 'concluida' then new.completion_note end));
  end if;
  if (new.validation_requested_at is null) <> (old.validation_requested_at is null) and new.status = 'em_andamento' and old.status = 'em_andamento' then
    insert into public.action_history (action_id, program_id, kind, changes, note)
    values (new.id, new.program_id, 'edicao',
            jsonb_build_object('etapa', case when new.validation_requested_at is not null then 'enviada_validacao' else 'devolvida' end), v_note);
  end if;
  if new.blocked <> old.blocked then
    insert into public.action_history (action_id, program_id, kind, changes, note)
    values (new.id, new.program_id, 'edicao', jsonb_build_object('bloqueio', case when new.blocked then 'bloqueada' else 'desbloqueada' end),
            case when new.blocked then new.blocked_reason else v_note end);
  end if;
  if new.title is distinct from old.title then v_changes := v_changes || jsonb_build_object('title', jsonb_build_array(old.title, new.title)); end if;
  if new.owner_person_id is distinct from old.owner_person_id then v_changes := v_changes || jsonb_build_object('owner_person_id', jsonb_build_array(old.owner_person_id, new.owner_person_id)); end if;
  if new.due_date is distinct from old.due_date then v_changes := v_changes || jsonb_build_object('due_date', jsonb_build_array(old.due_date, new.due_date)); end if;
  if new.priority is distinct from old.priority then v_changes := v_changes || jsonb_build_object('priority', jsonb_build_array(old.priority, new.priority)); end if;
  if new.team_id is distinct from old.team_id then v_changes := v_changes || jsonb_build_object('team_id', jsonb_build_array(old.team_id, new.team_id)); end if;
  if new.theme is distinct from old.theme then v_changes := v_changes || jsonb_build_object('theme', jsonb_build_array(old.theme, new.theme)); end if;
  if new.description is distinct from old.description then v_changes := v_changes || jsonb_build_object('description', '"alterada"'::jsonb); end if;
  if new.archived_at is distinct from old.archived_at then v_changes := v_changes || jsonb_build_object('archived', jsonb_build_array(old.archived_at is not null, new.archived_at is not null)); end if;
  if v_changes <> '{}'::jsonb then
    insert into public.action_history (action_id, program_id, kind, changes) values (new.id, new.program_id, 'edicao', v_changes);
  end if;
  return new;
end $$;

-- Fluxo único para a interface: mover etapa, bloquear/desbloquear
create or replace function public.move_action(p_action uuid, p_stage text, p_note text default null)
returns public.actions language plpgsql security invoker set search_path = '' as $$
declare v public.actions; v_flow text;
begin
  select * into v from public.actions where id = p_action;
  if v.id is null then raise exception 'Ação não encontrada ou sem permissão.' using errcode = 'insufficient_privilege'; end if;
  perform set_config('app.status_note', coalesce(p_note, ''), true);
  case p_stage
    when 'a_fazer' then
      update public.actions set status = 'aberta' where id = p_action returning * into v;
    when 'em_andamento' then
      if v.validation_requested_at is not null then
        perform set_config('app.action_flow', 'devolver', true);
        update public.actions set validation_requested_at = null, validation_requested_by = null where id = p_action returning * into v;
      else
        update public.actions set status = 'em_andamento' where id = p_action returning * into v;
      end if;
    when 'em_validacao' then
      if v.status not in ('aberta', 'em_andamento') then
        raise exception 'Só ações a fazer ou em andamento vão para validação.' using errcode = 'check_violation';
      end if;
      perform set_config('app.action_flow', 'validar', true);
      update public.actions set status = 'em_andamento', validation_requested_at = now(), validation_requested_by = auth.uid(),
        completion_note = coalesce(nullif(btrim(p_note), ''), completion_note)
      where id = p_action returning * into v;
    when 'concluida' then
      perform set_config('app.action_flow', 'concluir', true);
      update public.actions set status = 'concluida', completion_note = coalesce(nullif(btrim(p_note), ''), completion_note)
      where id = p_action returning * into v;
    when 'cancelada' then
      if nullif(btrim(p_note), '') is null then raise exception 'Informe o motivo do cancelamento.' using errcode = 'check_violation'; end if;
      update public.actions set status = 'cancelada' where id = p_action returning * into v;
    else
      raise exception 'Etapa inválida.' using errcode = 'check_violation';
  end case;
  perform set_config('app.action_flow', '', true);
  perform set_config('app.status_note', '', true);
  if v.id is null then raise exception 'Sem permissão para mover esta ação.' using errcode = 'insufficient_privilege'; end if;
  return v;
end $$;

create or replace function public.set_action_blocked(p_action uuid, p_blocked boolean, p_reason text default null)
returns public.actions language plpgsql security invoker set search_path = '' as $$
declare v public.actions;
begin
  if p_blocked and nullif(btrim(p_reason), '') is null then
    raise exception 'Informe o motivo do bloqueio.' using errcode = 'check_violation';
  end if;
  perform set_config('app.status_note', coalesce(p_reason, ''), true);
  update public.actions set blocked = p_blocked, blocked_reason = case when p_blocked then btrim(p_reason) else null end
  where id = p_action and status in ('aberta', 'em_andamento') and validation_requested_at is null
  returning * into v;
  perform set_config('app.status_note', '', true);
  if v.id is null then raise exception 'Só ações a fazer ou em andamento (fora da validação) podem ser bloqueadas.' using errcode = 'check_violation'; end if;
  return v;
end $$;

revoke execute on function public.move_action(uuid, text, text), public.set_action_blocked(uuid, boolean, text) from public, anon;
grant execute on function public.move_action(uuid, text, text), public.set_action_blocked(uuid, boolean, text) to authenticated;

-- Visão com a etapa do workflow e indicadores de prazo (security_invoker: respeita RLS)
drop view public.actions_view;
create view public.actions_view with (security_invoker = true) as
select a.*,
       case
         when a.status = 'em_andamento' and a.validation_requested_at is not null then 'em_validacao'
         when a.status = 'aberta' then 'a_fazer'
         when a.status = 'bloqueada' then 'em_andamento'
         else a.status::text
       end as stage,
       (a.due_date is not null and a.due_date < private.today() and a.status not in ('concluida', 'cancelada')) as is_overdue,
       case when a.due_date is not null and a.status not in ('concluida', 'cancelada') then a.due_date - private.today() end as days_to_due,
       case when a.status = 'concluida' and a.due_date is not null
            then (a.completed_at at time zone 'America/Sao_Paulo')::date <= a.due_date end as completed_on_time,
       (select count(*) from public.action_evidences e where e.action_id = a.id)::int as evidence_count,
       (select count(*) from public.action_dependencies d join public.actions x on x.id = d.depends_on_id
         where d.action_id = a.id and x.status not in ('concluida', 'cancelada'))::int as open_dependencies,
       pr.competition_id, pr.unit_id, pr.cycle_id
from public.actions a
join public.programs pr on pr.id = a.program_id;
grant select on public.actions_view to authenticated;

-- FRC, Giaffone e E-Kart em standby (continuam cadastradas)
update public.competitions set active = false where code in ('FRC', 'GIAFFONE', 'E-KART');

revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon;

-- >>>>> supabase/migrations/20261130000100_avisos_workflow.sql
-- Etapa 4.3 — Avisos automáticos do workflow de ações (no sino do portal; sem envio externo)
-- • Ação enviada para validação  → avisa a supervisão da frente
-- • Ação aprovada (concluída) ou devolvida → avisa o responsável
-- Quem fez a ação não recebe aviso dela própria. Avisos de validação são resolvidos ao decidir.

alter table public.notifications drop constraint notifications_rule_check;
alter table public.notifications add constraint notifications_rule_check
  check (rule in ('acao_vencida', 'checklist_pendente', 'relatorio_nao_enviado', 'nota_abaixo_rampa',
                  'recurso_bloqueante', 'risco_critico', 'ch_abaixo_meta', 'simulado_ausente',
                  'acao_em_validacao', 'acao_aprovada', 'acao_devolvida'));

-- O guarda só deve barrar o usuário (papel authenticated/anon); funções do sistema
-- (security definer, executam como dono) podem resolver avisos mesmo com usuário logado.
create or replace function private.notifications_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and (new.user_id, new.rule, new.entity_id, new.dedupe_key, new.title, new.resolved_at)
     is distinct from (old.user_id, old.rule, old.entity_id, old.dedupe_key, old.title, old.resolved_at) then
    raise exception 'Somente a leitura da notificação pode ser alterada.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

create or replace function private.actions_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_link text := '/acoes/' || new.id;
  v_stamp text := to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS');
begin
  -- enviada para validação
  if new.validation_requested_at is not null and old.validation_requested_at is null then
    insert into public.notifications (user_id, program_id, rule, entity_table, entity_id, period_key, title, link, dedupe_key)
    select s, new.program_id, 'acao_em_validacao', 'actions', new.id, v_stamp,
           'Aguardando sua validação: ' || new.title, v_link,
           'acao_em_validacao:' || new.id || ':' || v_stamp || ':' || s
    from private.program_supervisors(new.program_id) s
    where s is distinct from v_actor
    on conflict (dedupe_key) do nothing;
    return new;
  end if;

  -- decisão tomada (aprovada, devolvida ou cancelada): some da fila de validação
  if old.validation_requested_at is not null and (new.validation_requested_at is null or new.status <> 'em_andamento') then
    update public.notifications n set resolved_at = now()
    where n.resolved_at is null and n.rule = 'acao_em_validacao' and n.entity_id = new.id;
  end if;

  select p.user_id into v_owner from public.people p where p.id = new.owner_person_id;
  if v_owner is null or v_owner is not distinct from v_actor then return new; end if;

  if new.status = 'concluida' and old.status <> 'concluida' then
    insert into public.notifications (user_id, program_id, rule, entity_table, entity_id, period_key, title, link, dedupe_key)
    values (v_owner, new.program_id, 'acao_aprovada', 'actions', new.id, v_stamp,
            'Ação aprovada: ' || new.title, v_link, 'acao_aprovada:' || new.id || ':' || v_stamp)
    on conflict (dedupe_key) do nothing;
  elsif old.validation_requested_at is not null and new.validation_requested_at is null and new.status = 'em_andamento' then
    insert into public.notifications (user_id, program_id, rule, entity_table, entity_id, period_key, title, link, dedupe_key)
    values (v_owner, new.program_id, 'acao_devolvida', 'actions', new.id, v_stamp,
            'Ação devolvida para ajuste: ' || new.title
              || coalesce(' — ' || nullif(btrim(current_setting('app.status_note', true)), ''), ''),
            v_link, 'acao_devolvida:' || new.id || ':' || v_stamp)
    on conflict (dedupe_key) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists actions_notify on public.actions;
create trigger actions_notify after update of status, validation_requested_at on public.actions
  for each row execute function private.actions_notify();

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

-- Ciclo 2027–2028 (decisão da supervisão, 25/11/2026). Datas oficiais ainda não informadas: permanecem vazias.
insert into public.cycles (code, name) values ('2027-2028', 'Ciclo 2027–2028')
on conflict (code) do nothing;

-- Programas com evidência no PRD:
--   WorldSkills Beira-Mar (#33, #48), WorldSkills Porto (#50), INOVA Beira-Mar (Digital Twin, base 2026)
insert into public.programs (competition_id, cycle_id, unit_id, status)
select c.id, cy.id, u.id, 'planejamento'
from (values ('WORLDSKILLS', 'BEIRA-MAR'), ('WORLDSKILLS', 'PORTO'), ('INOVA', 'BEIRA-MAR')) v(comp, unit)
join public.competitions c on c.code = v.comp
join public.units u on u.code = v.unit
join public.cycles cy on cy.code = '2027-2028'
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
join public.cycles cy on cy.code = '2027-2028'
join public.programs p on p.competition_id = c.id and p.cycle_id = cy.id and p.unit_id = u.id
on conflict (program_id, code) do nothing;

-- Rubrica interna preliminar INOVA (criada aqui em instalações novas; idempotente)
select private.seed_inova_rubric();

commit;
