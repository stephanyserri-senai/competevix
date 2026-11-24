-- =============================================================================
-- COMPETE VIX — DESFAZER INSTALAÇÃO (use só se o diagnóstico mostrar instalação PARCIAL)
-- Remove APENAS os objetos criados pelo portal no esquema public/private.
-- APAGA OS DADOS DO PORTAL. Não toca em usuários do Auth nem no bucket "documentos".
-- Depois rode novamente instalacao_completa.sql.
-- =============================================================================
begin;

drop trigger if exists on_auth_user_created on auth.users;
drop policy if exists documentos_select on storage.objects;
drop policy if exists documentos_insert on storage.objects;

drop view if exists public.actions_view;

drop table if exists
  public.notifications, public.audit_log,
  public.checklist_answer_evidences, public.checklist_answers, public.checklist_runs,
  public.checklist_items, public.checklist_templates,
  public.action_history, public.action_evidences, public.action_dependencies, public.actions,
  public.event_exceptions, public.event_participants, public.events,
  public.documents, public.team_members, public.teams, public.people, public.memberships,
  public.occupations, public.stages, public.programs, public.cycles, public.competitions,
  public.units, public.platform_admins, public.profiles
  cascade;

do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'admin_list_users', 'my_access', 'set_action_status', 'publish_checklist_template',
      'new_checklist_version', 'complete_checklist_run', 'refresh_alerts', 'link_person_to_user')
  loop
    execute format('drop function if exists %s cascade', f);
  end loop;
end $$;

drop type if exists
  public.competition_kind, public.program_status, public.membership_role, public.team_member_role,
  public.person_kind, public.document_classification, public.event_type, public.recurrence_freq,
  public.event_exception_kind, public.action_status, public.action_priority, public.action_history_kind,
  public.checklist_cadence, public.checklist_scope, public.checklist_template_status,
  public.checklist_run_status, public.checklist_answer_value
  cascade;

drop schema if exists private cascade;

commit;
