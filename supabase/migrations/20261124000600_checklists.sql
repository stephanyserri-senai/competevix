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
