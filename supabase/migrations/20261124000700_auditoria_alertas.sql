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
