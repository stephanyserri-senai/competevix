-- =============================================================================
-- COMPETE VIX — AJUSTE — ETAPA 3 (INOVA: simulação interna e resultados no evento) (gerado por scripts/bundle-sql.sh)
-- Execute UMA ÚNICA VEZ somente se a Etapa 3 JÁ estiver instalada (diagnóstico: etapa3_inova = true).
-- Tudo roda numa transação: se algo falhar, nada é aplicado.
-- =============================================================================
begin;
do $$ begin
  if to_regclass('public.projects') is null then raise exception 'Etapa 3 não instalada: use atualizacao_etapa3.sql (já contém este ajuste).'; end if;
  if to_regclass('public.project_results') is not null then raise exception 'Ajuste da Etapa 3 já aplicado: nada a fazer.'; end if;
end $$;

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
