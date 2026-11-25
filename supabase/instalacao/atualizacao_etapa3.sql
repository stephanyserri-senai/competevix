-- =============================================================================
-- COMPETE VIX — ATUALIZAÇÃO — ETAPA 3 (INOVA SENAI) + ciclo 2027–2028 (gerado por scripts/bundle-sql.sh)
-- Execute UMA ÚNICA VEZ num banco que já recebeu as Etapas 1 e 2.
-- Tudo roda numa transação: se algo falhar, nada é aplicado.
-- =============================================================================
begin;
do $$ begin
  if to_regclass('public.training_plans') is null then raise exception 'Instale primeiro a Etapa 2 (atualizacao_etapa2.sql).'; end if;
  if to_regclass('public.projects') is not null then raise exception 'Etapa 3 já instalada: nada a fazer.'; end if;
end $$;

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

commit;
