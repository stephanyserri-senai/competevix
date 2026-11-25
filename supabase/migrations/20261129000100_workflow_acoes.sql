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
