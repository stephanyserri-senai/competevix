-- COMPETE VIX — diagnóstico da instalação (somente leitura; pode rodar quantas vezes quiser)
select
  to_regtype('public.competition_kind') is not null               as tipos,
  to_regclass('public.units') is not null                         as fundacao_0100,
  to_regprocedure('private.can_read_scope(uuid,uuid)') is not null as autorizacao_0200,
  to_regclass('public.documents') is not null                     as documentos_0300,
  to_regclass('public.events') is not null                        as agenda_0400,
  to_regclass('public.actions') is not null                       as acoes_0500,
  to_regclass('public.checklist_runs') is not null                as checklists_0600,
  to_regclass('public.audit_log') is not null                     as auditoria_0700,
  to_regprocedure('public.link_person_to_user(uuid,text)') is not null as vinculo_0800,
  exists (select 1 from storage.buckets where id = 'documentos')  as bucket,
  to_regclass('public.training_plans') is not null                as etapa2_worldskills,
  to_regclass('public.panels') is not null                        as etapa3_inova;
