-- =============================================================================
-- COMPETE VIX — 0300 Documentos privados (núcleo do RF13, usado como evidência)
-- PRD §10: Storage privado, URLs assinadas de curta duração, validação MIME/tamanho,
-- nomes aleatórios. Vínculos por tabelas de associação com FK por tipo (§8).
-- =============================================================================

create type public.document_classification as enum ('interno', 'restrito', 'confidencial');

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id),
  team_id uuid,
  title text not null check (length(btrim(title)) between 2 and 200),
  original_name text not null check (length(original_name) between 1 and 255),
  -- Caminho aleatório gerado pelo servidor: {program_id}/{uuid}.{ext}
  storage_path text not null unique,
  mime_type text not null check (mime_type in (
    'application/pdf', 'image/png', 'image/jpeg', 'image/webp',
    'text/plain', 'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  )),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 20971520),
  classification public.document_classification not null default 'interno',
  version integer not null default 1 check (version >= 1),
  supersedes_id uuid,
  uploaded_by uuid not null default auth.uid() references public.profiles (id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  constraint documents_scope_uk unique (id, program_id),
  constraint documents_team_fk foreign key (team_id, program_id) references public.teams (id, program_id),
  constraint documents_supersedes_fk foreign key (supersedes_id, program_id) references public.documents (id, program_id),
  constraint documents_path_ck check (
    storage_path ~ ('^' || program_id::text || '/[0-9a-f-]{36}\.[a-z0-9]{1,8}$')
  )
);
create index documents_program_idx on public.documents (program_id);
create index documents_team_idx on public.documents (team_id);

-- Confidencial: apenas supervisão do programa e quem enviou.
-- A versão "_row" avalia colunas da linha (necessária para INSERT ... RETURNING).
create or replace function private.can_read_document_row(
  p_program uuid, p_team uuid, p_class public.document_classification, p_uploader uuid
) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_read_scope(p_program, p_team)
     and (p_class <> 'confidencial' or p_uploader = auth.uid() or private.has_program_role(p_program, '{supervisao}'))
$$;

create or replace function private.can_read_document(p_doc uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.documents d
    where d.id = p_doc and private.can_read_document_row(d.program_id, d.team_id, d.classification, d.uploaded_by)
  )
$$;

create or replace function private.can_read_storage_object(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.documents d
    where d.storage_path = p_name and private.can_read_document(d.id)
  )
$$;

grant execute on function private.can_read_document(uuid), private.can_read_storage_object(text),
  private.can_read_document_row(uuid, uuid, public.document_classification, uuid) to authenticated;

grant select, insert, update, delete on public.documents to authenticated;
alter table public.documents enable row level security;

create policy documents_select on public.documents for select to authenticated
  using (private.can_read_document_row(program_id, team_id, classification, uploaded_by));
-- Quem gerencia o escopo pode registrar documentos; uploaded_by é sempre o próprio usuário.
create policy documents_insert on public.documents for insert to authenticated with check (
  uploaded_by = auth.uid() and private.can_manage_scope(program_id, team_id)
);
-- Atualização apenas para arquivar/reclassificar (supervisão ou autor).
create policy documents_update on public.documents for update to authenticated
  using (private.has_program_role(program_id, '{supervisao}') or uploaded_by = auth.uid())
  with check (private.can_manage_scope(program_id, team_id) or uploaded_by = auth.uid());
-- Exclusão só do próprio registro recém-criado (desfazer upload que falhou).
create policy documents_delete on public.documents for delete to authenticated
  using (uploaded_by = auth.uid() and created_at > now() - interval '15 minutes');

-- Campos que identificam o arquivo são imutáveis (nova versão = novo registro).
create or replace function private.documents_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.storage_path <> old.storage_path or new.program_id <> old.program_id
     or new.mime_type <> old.mime_type or new.size_bytes <> old.size_bytes
     or new.uploaded_by <> old.uploaded_by or new.version <> old.version then
    raise exception 'Arquivo registrado é imutável; envie uma nova versão.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger documents_guard before update on public.documents
  for each row execute function private.documents_guard();

-- Versão sequencial a partir do documento substituído
create or replace function private.documents_set_version() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.supersedes_id is not null then
    select d.version + 1 into new.version from public.documents d where d.id = new.supersedes_id;
  else
    new.version := 1;
  end if;
  return new;
end $$;
create trigger documents_set_version before insert on public.documents
  for each row execute function private.documents_set_version();

-- ---------------------------------------------------------------------------
-- Storage: bucket privado e políticas espelhando o RLS de documents
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', false, 20971520, array[
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain', 'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy documentos_select on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and private.can_read_storage_object(name));

-- Upload só é aceito se já existe o registro em documents, feito pelo mesmo usuário.
create policy documentos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documentos'
    and exists (
      select 1 from public.documents d
      where d.storage_path = name and d.uploaded_by = auth.uid() and d.archived_at is null
    )
  );
-- Sem políticas de UPDATE/DELETE: arquivos são imutáveis para clientes.
