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
