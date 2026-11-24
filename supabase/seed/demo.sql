-- =============================================================================
-- SEED DE DEMONSTRAÇÃO — DADOS FICTÍCIOS, SOMENTE PARA DESENVOLVIMENTO LOCAL.
-- NUNCA aplicar em homologação/produção (PRD §10: não usar dados reais em dev,
-- e dados fictícios não podem se passar por registros reais).
-- Tudo é rotulado "[DEMO]" e fica em unidades e ciclo próprios (DEMO-A, DEMO-B, DEMO).
-- Requer references.sql aplicado antes (usa o catálogo de competições).
-- Senha de todos os usuários: Demo-Compete-2026
-- =============================================================================
do $$
declare
  v_pw text := extensions.crypt('Demo-Compete-2026', extensions.gen_salt('bf'));
  v_users jsonb := '[
    {"key":"admin","email":"admin@demo.compete.local","name":"[DEMO] Administração"},
    {"key":"sup_a","email":"supervisao.a@demo.compete.local","name":"[DEMO] Supervisão Unidade A"},
    {"key":"sup_b","email":"supervisao.b@demo.compete.local","name":"[DEMO] Supervisão Unidade B"},
    {"key":"gestao","email":"gestao@demo.compete.local","name":"[DEMO] Gestão Unidade A"},
    {"key":"orient","email":"orientador@demo.compete.local","name":"[DEMO] Orientador(a) Equipe Alfa"},
    {"key":"comp","email":"competidor@demo.compete.local","name":"[DEMO] Competidor(a) Equipe Alfa"}
  ]';
  u jsonb;
  v_id uuid;
  ids jsonb := '{}'::jsonb;
  v_unit_a uuid; v_unit_b uuid; v_cycle uuid; v_ws uuid; v_inova uuid;
  v_p_ws_a uuid; v_p_inova_a uuid; v_p_ws_b uuid;
  v_occ uuid; v_team_alfa uuid; v_team_beta uuid; v_team_b uuid;
  v_pe_orient uuid; v_pe_comp uuid; v_pe_comp2 uuid; v_pe_b uuid;
  v_tpl uuid; v_a1 uuid; v_a2 uuid;
  v_monday date := date_trunc('week', (now() at time zone 'America/Sao_Paulo'))::date;
begin
  if exists (select 1 from public.units where code = 'DEMO-A') then
    raise notice 'Seed de demonstração já aplicado; nada a fazer.';
    return;
  end if;

  select id into v_ws from public.competitions where code = 'WORLDSKILLS';
  select id into v_inova from public.competitions where code = 'INOVA';
  if v_ws is null or v_inova is null then
    raise exception 'Aplique supabase/seed/references.sql antes do seed de demonstração.';
  end if;

  for u in select * from jsonb_array_elements(v_users) loop
    v_id := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change, email_change_token_new)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u ->> 'email', v_pw, now(),
            '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', u ->> 'name'), now(), now(),
            '', '', '', '');
    insert into auth.identities (user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    values (v_id, v_id::text, 'email', jsonb_build_object('sub', v_id::text, 'email', u ->> 'email', 'email_verified', true), now(), now(), now());
    ids := ids || jsonb_build_object(u ->> 'key', v_id);
  end loop;

  insert into public.platform_admins (user_id) values ((ids ->> 'admin')::uuid);

  insert into public.units (code, name) values ('DEMO-A', '[DEMO] Unidade A fictícia') returning id into v_unit_a;
  insert into public.units (code, name) values ('DEMO-B', '[DEMO] Unidade B fictícia') returning id into v_unit_b;
  insert into public.cycles (code, name, start_date, end_date)
  values ('DEMO', '[DEMO] Ciclo de demonstração', v_monday - 60, v_monday + 300) returning id into v_cycle;

  insert into public.programs (competition_id, cycle_id, unit_id, status, settings)
  values (v_ws, v_cycle, v_unit_a, 'ativo', '{"acao_conclusao_exige":"nota_ou_evidencia"}') returning id into v_p_ws_a;
  insert into public.programs (competition_id, cycle_id, unit_id, status)
  values (v_inova, v_cycle, v_unit_a, 'ativo') returning id into v_p_inova_a;
  insert into public.programs (competition_id, cycle_id, unit_id, status)
  values (v_ws, v_cycle, v_unit_b, 'ativo') returning id into v_p_ws_b;

  insert into public.memberships (user_id, unit_id, role) values ((ids ->> 'sup_a')::uuid, v_unit_a, 'supervisao');
  insert into public.memberships (user_id, unit_id, role) values ((ids ->> 'gestao')::uuid, v_unit_a, 'gestao');
  insert into public.memberships (user_id, unit_id, role) values ((ids ->> 'sup_b')::uuid, v_unit_b, 'supervisao');
  insert into public.memberships (user_id, program_id, role) values ((ids ->> 'orient')::uuid, v_p_ws_a, 'orientador');
  insert into public.memberships (user_id, program_id, role) values ((ids ->> 'comp')::uuid, v_p_ws_a, 'competidor');

  insert into public.stages (program_id, name, position) values
    (v_p_ws_a, '[DEMO] Seletiva interna', 0), (v_p_ws_a, '[DEMO] Etapa estadual', 1);
  insert into public.occupations (program_id, code, name, target_score, target_source)
  values (v_p_ws_a, 'D-01', '[DEMO] Ocupação fictícia', 700, '[DEMO] valor ilustrativo, sem fonte real')
  returning id into v_occ;

  insert into public.people (unit_id, full_name, kind, user_id) values (v_unit_a, '[DEMO] Orientador(a) Alfa', 'docente', (ids ->> 'orient')::uuid) returning id into v_pe_orient;
  insert into public.people (unit_id, full_name, kind, user_id) values (v_unit_a, '[DEMO] Competidor(a) Alfa', 'aluno', (ids ->> 'comp')::uuid) returning id into v_pe_comp;
  insert into public.people (unit_id, full_name, kind) values (v_unit_a, '[DEMO] Competidor(a) Beta', 'aluno') returning id into v_pe_comp2;
  insert into public.people (unit_id, full_name, kind) values (v_unit_b, '[DEMO] Pessoa da Unidade B', 'aluno') returning id into v_pe_b;

  insert into public.teams (program_id, occupation_id, name) values (v_p_ws_a, v_occ, '[DEMO] Equipe Alfa') returning id into v_team_alfa;
  insert into public.teams (program_id, occupation_id, name) values (v_p_ws_a, v_occ, '[DEMO] Equipe Beta') returning id into v_team_beta;
  insert into public.teams (program_id, name) values (v_p_ws_b, '[DEMO] Equipe Unidade B') returning id into v_team_b;

  insert into public.team_members (team_id, program_id, person_id, role) values
    (v_team_alfa, v_p_ws_a, v_pe_orient, 'orientador_titular'),
    (v_team_alfa, v_p_ws_a, v_pe_comp, 'competidor'),
    (v_team_beta, v_p_ws_a, v_pe_comp2, 'competidor'),
    (v_team_b, v_p_ws_b, v_pe_b, 'competidor');

  -- Agenda: treino recorrente (seg/qua/sex 08:00–12:00 BRT) e reunião que conflita com o treino
  insert into public.events (program_id, team_id, title, type, starts_at, ends_at, owner_person_id,
                             recurrence_freq, recurrence_weekdays, recurrence_count)
  values (v_p_ws_a, v_team_alfa, '[DEMO] Treino técnico', 'treino',
          (v_monday + time '08:00') at time zone 'America/Sao_Paulo', (v_monday + time '12:00') at time zone 'America/Sao_Paulo',
          v_pe_orient, 'semanal', '{1,3,5}', 24);
  insert into public.events (program_id, title, type, starts_at, ends_at, owner_person_id)
  values (v_p_ws_a, '[DEMO] Reunião de alinhamento', 'reuniao',
          (v_monday + 2 + time '10:00') at time zone 'America/Sao_Paulo', (v_monday + 2 + time '11:00') at time zone 'America/Sao_Paulo',
          v_pe_orient);
  insert into public.event_participants (event_id, program_id, person_id)
  select e.id, e.program_id, v_pe_orient from public.events e where e.title = '[DEMO] Reunião de alinhamento';
  insert into public.events (program_id, team_id, title, type, starts_at, ends_at)
  values (v_p_ws_b, v_team_b, '[DEMO] Treino Unidade B', 'treino',
          (v_monday + 1 + time '13:00') at time zone 'America/Sao_Paulo', (v_monday + 1 + time '17:00') at time zone 'America/Sao_Paulo');

  -- Ações (uma vencida, uma bloqueada, dependência)
  insert into public.actions (program_id, team_id, title, owner_person_id, due_date, priority, origin)
  values (v_p_ws_a, v_team_alfa, '[DEMO] Revisar plano da semana', v_pe_orient, v_monday - 2, 'alta', '[DEMO]') returning id into v_a1;
  insert into public.actions (program_id, title, due_date, priority, origin)
  values (v_p_ws_a, '[DEMO] Levantar insumos do posto de treino', v_monday + 9, 'media', '[DEMO]') returning id into v_a2;
  insert into public.action_dependencies (action_id, depends_on_id, program_id) values (v_a2, v_a1, v_p_ws_a);
  insert into public.actions (program_id, title, priority, origin, status, blocked_reason)
  values (v_p_ws_a, '[DEMO] Agendar visita técnica', 'baixa', '[DEMO]', 'aberta', null);
  insert into public.actions (program_id, team_id, title, origin) values (v_p_ws_b, v_team_b, '[DEMO] Ação da Unidade B', '[DEMO]');

  -- Checklist semanal publicado
  insert into public.checklist_templates (program_id, name, cadence, scope, description)
  values (v_p_ws_a, '[DEMO] Rotina semanal da equipe', 'semanal', 'equipe', 'Modelo ilustrativo.') returning id into v_tpl;
  insert into public.checklist_items (template_id, program_id, position, label, required, requires_evidence) values
    (v_tpl, v_p_ws_a, 0, '[DEMO] Plano semanal revisado com a equipe', true, false),
    (v_tpl, v_p_ws_a, 1, '[DEMO] Posto de treino conferido', true, false),
    (v_tpl, v_p_ws_a, 2, '[DEMO] Registro de evidência do treino', false, true);
  update public.checklist_templates set status = 'publicado', published_at = now() where id = v_tpl;
  insert into public.checklist_runs (template_id, program_id, team_id, period_start, period_end)
  values (v_tpl, v_p_ws_a, v_team_alfa, v_monday - 7, v_monday - 1);

  raise notice 'Seed de demonstração aplicado.';
end $$;
