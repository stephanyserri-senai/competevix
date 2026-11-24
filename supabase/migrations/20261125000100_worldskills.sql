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
