-- =============================================================================
-- COMPETE VIX — ATUALIZAÇÃO — ETAPA 4.3 (avisos automáticos do workflow de ações) (gerado por scripts/bundle-sql.sh)
-- Execute UMA ÚNICA VEZ num banco com a Etapa 4.2.
-- Tudo roda numa transação: se algo falhar, nada é aplicado.
-- =============================================================================
begin;
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'actions' and column_name = 'validation_requested_at') then raise exception 'Aplique antes a Etapa 4.2 (atualizacao_etapa4_2.sql).'; end if;
  if to_regprocedure('private.actions_notify()') is not null then raise exception 'Etapa 4.3 já instalada: nada a fazer.'; end if;
end $$;

-- >>>>> supabase/migrations/20261130000100_avisos_workflow.sql
-- Etapa 4.3 — Avisos automáticos do workflow de ações (no sino do portal; sem envio externo)
-- • Ação enviada para validação  → avisa a supervisão da frente
-- • Ação aprovada (concluída) ou devolvida → avisa o responsável
-- Quem fez a ação não recebe aviso dela própria. Avisos de validação são resolvidos ao decidir.

alter table public.notifications drop constraint notifications_rule_check;
alter table public.notifications add constraint notifications_rule_check
  check (rule in ('acao_vencida', 'checklist_pendente', 'relatorio_nao_enviado', 'nota_abaixo_rampa',
                  'recurso_bloqueante', 'risco_critico', 'ch_abaixo_meta', 'simulado_ausente',
                  'acao_em_validacao', 'acao_aprovada', 'acao_devolvida'));

-- O guarda só deve barrar o usuário (papel authenticated/anon); funções do sistema
-- (security definer, executam como dono) podem resolver avisos mesmo com usuário logado.
create or replace function private.notifications_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and (new.user_id, new.rule, new.entity_id, new.dedupe_key, new.title, new.resolved_at)
     is distinct from (old.user_id, old.rule, old.entity_id, old.dedupe_key, old.title, old.resolved_at) then
    raise exception 'Somente a leitura da notificação pode ser alterada.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

create or replace function private.actions_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_link text := '/acoes/' || new.id;
  v_stamp text := to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS');
begin
  -- enviada para validação
  if new.validation_requested_at is not null and old.validation_requested_at is null then
    insert into public.notifications (user_id, program_id, rule, entity_table, entity_id, period_key, title, link, dedupe_key)
    select s, new.program_id, 'acao_em_validacao', 'actions', new.id, v_stamp,
           'Aguardando sua validação: ' || new.title, v_link,
           'acao_em_validacao:' || new.id || ':' || v_stamp || ':' || s
    from private.program_supervisors(new.program_id) s
    where s is distinct from v_actor
    on conflict (dedupe_key) do nothing;
    return new;
  end if;

  -- decisão tomada (aprovada, devolvida ou cancelada): some da fila de validação
  if old.validation_requested_at is not null and (new.validation_requested_at is null or new.status <> 'em_andamento') then
    update public.notifications n set resolved_at = now()
    where n.resolved_at is null and n.rule = 'acao_em_validacao' and n.entity_id = new.id;
  end if;

  select p.user_id into v_owner from public.people p where p.id = new.owner_person_id;
  if v_owner is null or v_owner is not distinct from v_actor then return new; end if;

  if new.status = 'concluida' and old.status <> 'concluida' then
    insert into public.notifications (user_id, program_id, rule, entity_table, entity_id, period_key, title, link, dedupe_key)
    values (v_owner, new.program_id, 'acao_aprovada', 'actions', new.id, v_stamp,
            'Ação aprovada: ' || new.title, v_link, 'acao_aprovada:' || new.id || ':' || v_stamp)
    on conflict (dedupe_key) do nothing;
  elsif old.validation_requested_at is not null and new.validation_requested_at is null and new.status = 'em_andamento' then
    insert into public.notifications (user_id, program_id, rule, entity_table, entity_id, period_key, title, link, dedupe_key)
    values (v_owner, new.program_id, 'acao_devolvida', 'actions', new.id, v_stamp,
            'Ação devolvida para ajuste: ' || new.title
              || coalesce(' — ' || nullif(btrim(current_setting('app.status_note', true)), ''), ''),
            v_link, 'acao_devolvida:' || new.id || ':' || v_stamp)
    on conflict (dedupe_key) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists actions_notify on public.actions;
create trigger actions_notify after update of status, validation_requested_at on public.actions
  for each row execute function private.actions_notify();

commit;
