-- =============================================================================
-- COMPETE VIX — 0400 Agenda (RF04): eventos, recorrência, exceções e participantes
-- Recorrência armazenada como subconjunto de RRULE (RFC 5545): FREQ, INTERVAL,
-- BYDAY, UNTIL/COUNT. A expansão das ocorrências é feita no domínio (TypeScript)
-- e na exportação ICS. Exceções são editáveis por ocorrência.
-- =============================================================================

create type public.event_type as enum ('treino', 'reuniao', 'simulado', 'banca', 'visita', 'competicao', 'prazo', 'outro');
create type public.recurrence_freq as enum ('diaria', 'semanal', 'mensal');
create type public.event_exception_kind as enum ('cancelada', 'alterada');

create table public.events (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id),
  team_id uuid,
  title text not null check (length(btrim(title)) between 2 and 200),
  description text check (length(description) <= 4000),
  type public.event_type not null default 'outro',
  location text check (length(location) <= 200),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  owner_person_id uuid references public.people (id),
  recurrence_freq public.recurrence_freq,
  recurrence_interval smallint not null default 1 check (recurrence_interval between 1 and 52),
  -- Dias da semana 0=domingo … 6=sábado (apenas para recorrência semanal)
  recurrence_weekdays smallint[] check (recurrence_weekdays <@ array[0,1,2,3,4,5,6]::smallint[]),
  recurrence_until date,
  recurrence_count smallint check (recurrence_count between 1 and 500),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  constraint events_scope_uk unique (id, program_id),
  constraint events_team_fk foreign key (team_id, program_id) references public.teams (id, program_id),
  constraint events_time_ck check (ends_at > starts_at and ends_at - starts_at <= interval '14 days'),
  constraint events_recurrence_end_ck check (recurrence_until is null or recurrence_count is null),
  constraint events_recurrence_bounded_ck check (
    recurrence_freq is null or recurrence_until is not null or recurrence_count is not null
  ),
  constraint events_weekdays_ck check (recurrence_weekdays is null or recurrence_freq = 'semanal')
);
create index events_program_time_idx on public.events (program_id, starts_at);
create index events_team_idx on public.events (team_id);
create index events_owner_idx on public.events (owner_person_id);

create table public.event_participants (
  event_id uuid not null,
  program_id uuid not null,
  person_id uuid not null references public.people (id),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  primary key (event_id, person_id),
  constraint event_participants_event_fk foreign key (event_id, program_id)
    references public.events (id, program_id) on delete cascade
);
create index event_participants_person_idx on public.event_participants (person_id);

create table public.event_exceptions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  program_id uuid not null,
  -- Início ORIGINAL da ocorrência afetada (identificador da ocorrência, como RECURRENCE-ID)
  occurrence_start timestamptz not null,
  kind public.event_exception_kind not null,
  new_starts_at timestamptz,
  new_ends_at timestamptz,
  new_title text check (length(btrim(new_title)) between 2 and 200),
  new_location text check (length(new_location) <= 200),
  note text check (length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  constraint event_exceptions_event_fk foreign key (event_id, program_id)
    references public.events (id, program_id) on delete cascade,
  constraint event_exceptions_uk unique (event_id, occurrence_start),
  constraint event_exceptions_change_ck check (
    kind = 'cancelada'
    or (new_starts_at is not null and new_ends_at is not null and new_ends_at > new_starts_at)
  )
);

create trigger events_touch before update on public.events for each row execute function private.touch_updated_at();
create trigger event_exceptions_touch before update on public.event_exceptions for each row execute function private.touch_updated_at();

create or replace function private.events_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_person_visible(new.owner_person_id);
  if tg_op = 'UPDATE' and (new.program_id <> old.program_id) then
    raise exception 'Evento não pode mudar de programa.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger events_guard before insert or update on public.events
  for each row execute function private.events_guard();

create or replace function private.event_participants_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_person_visible(new.person_id);
  return new;
end $$;
create trigger event_participants_guard before insert on public.event_participants
  for each row execute function private.event_participants_guard();

-- Leitura/edição de filhos herdam o escopo do evento
create or replace function private.event_scope_ok(p_event uuid, p_manage boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.events e where e.id = p_event
      and case when p_manage then private.can_manage_scope(e.program_id, e.team_id)
               else private.can_read_scope(e.program_id, e.team_id) end
  )
$$;
grant execute on function private.event_scope_ok(uuid, boolean) to authenticated;

grant select, insert, update on public.events to authenticated;
grant select, insert, delete on public.event_participants to authenticated;
grant select, insert, update, delete on public.event_exceptions to authenticated;

alter table public.events enable row level security;
alter table public.event_participants enable row level security;
alter table public.event_exceptions enable row level security;

create policy events_select on public.events for select to authenticated
  using (private.can_read_scope(program_id, team_id));
create policy events_insert on public.events for insert to authenticated
  with check (private.can_manage_scope(program_id, team_id));
create policy events_update on public.events for update to authenticated
  using (private.can_manage_scope(program_id, team_id))
  with check (private.can_manage_scope(program_id, team_id));

create policy event_participants_select on public.event_participants for select to authenticated
  using (private.event_scope_ok(event_id, false));
create policy event_participants_insert on public.event_participants for insert to authenticated
  with check (private.event_scope_ok(event_id, true));
create policy event_participants_delete on public.event_participants for delete to authenticated
  using (private.event_scope_ok(event_id, true));

create policy event_exceptions_select on public.event_exceptions for select to authenticated
  using (private.event_scope_ok(event_id, false));
create policy event_exceptions_insert on public.event_exceptions for insert to authenticated
  with check (private.event_scope_ok(event_id, true));
create policy event_exceptions_update on public.event_exceptions for update to authenticated
  using (private.event_scope_ok(event_id, true)) with check (private.event_scope_ok(event_id, true));
create policy event_exceptions_delete on public.event_exceptions for delete to authenticated
  using (private.event_scope_ok(event_id, true));
