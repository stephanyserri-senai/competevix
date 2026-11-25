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
