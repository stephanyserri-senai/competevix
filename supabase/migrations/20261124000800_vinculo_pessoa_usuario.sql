-- =============================================================================
-- COMPETE VIX — 0800 Vínculo pessoa ↔ usuário (login)
-- A administração cria usuários e vínculos de acesso, mas não lê o cadastro de
-- pessoas (PRD §4: sem acesso automático a dados sensíveis). A supervisão da
-- unidade, que lê as pessoas, vincula a pessoa ao login informando o e-mail.
-- Só é aceito usuário que já tenha vínculo vigente com algum programa da unidade,
-- evitando enumerar contas de terceiros.
-- =============================================================================

create or replace function public.link_person_to_user(p_person uuid, p_email text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_unit uuid;
  v_user uuid;
begin
  select pe.unit_id into v_unit from public.people pe where pe.id = p_person;
  if v_unit is null or not private.supervises_unit(v_unit) then
    raise exception 'Pessoa não encontrada no seu escopo.' using errcode = 'insufficient_privilege';
  end if;

  if p_email is null or btrim(p_email) = '' then
    update public.people set user_id = null where id = p_person;
    return 'Vínculo com login removido.';
  end if;

  select u.id into v_user
  from auth.users u
  join public.profiles p on p.id = u.id and p.active
  where lower(u.email) = lower(btrim(p_email))
    and exists (
      select 1 from public.memberships m
      left join public.programs pr on pr.id = m.program_id
      where m.user_id = u.id and m.revoked_at is null
        and (m.valid_to is null or m.valid_to >= private.today())
        and (pr.unit_id = v_unit or m.unit_id = v_unit)
    );
  if v_user is null then
    raise exception 'Nenhum usuário ativo com esse e-mail e vínculo nesta unidade. Peça à administração o convite e o vínculo.'
      using errcode = 'check_violation';
  end if;

  update public.people set user_id = v_user where id = p_person;
  return 'Pessoa vinculada ao login.';
end $$;

revoke execute on function public.link_person_to_user(uuid, text) from public, anon;
grant execute on function public.link_person_to_user(uuid, text) to authenticated;
