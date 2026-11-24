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
