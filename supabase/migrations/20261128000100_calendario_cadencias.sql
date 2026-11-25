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
