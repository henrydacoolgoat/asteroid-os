-- MessageX offline media queue.
-- Media stays private in Supabase only until the laptop has stored and verified it.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'messagex-media-queue',
  'messagex-media-queue',
  false,
  104857600,
  array[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif',
    'image/heic', 'image/heif',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska',
    'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/ogg', 'audio/wav',
    'audio/x-wav', 'audio/webm', 'audio/flac', 'audio/aac'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.messagex_media_queue (
  id uuid primary key,
  message_id bigint unique references public.messages(id) on delete set null,
  chat_id uuid not null references public.chats(id) on delete cascade,
  sender text not null,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  object_path text not null unique,
  media_type text not null check (media_type ~ '^(image|video|audio)/'),
  original_name text not null default 'upload',
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 104857600),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  sent_at timestamptz not null,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  claim_token uuid,
  last_error text,
  laptop_media_url text,
  completed_at timestamptz,
  storage_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists messagex_media_queue_ready_idx
  on public.messagex_media_queue (status, next_attempt_at, created_at)
  where storage_deleted_at is null;

create index if not exists messagex_media_queue_chat_idx
  on public.messagex_media_queue (chat_id, sent_at desc);

alter table public.messagex_media_queue enable row level security;

drop policy if exists messagex_media_queue_read on public.messagex_media_queue;
create policy messagex_media_queue_read
  on public.messagex_media_queue
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.chats c
      where c.id = messagex_media_queue.chat_id
        and public.messagex_current_username() = any (c.members)
        and not (public.messagex_current_username() = any (coalesce(c.hidden_for, array[]::text[])))
    )
  );

drop policy if exists messagex_media_queue_insert on storage.objects;
create policy messagex_media_queue_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'messagex-media-queue'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and array_length(storage.foldername(name), 1) = 3
    and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and (storage.foldername(name))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and exists (
      select 1
      from public.chats c
      where c.id = ((storage.foldername(storage.objects.name))[2])::uuid
        and public.messagex_current_username() = any (c.members)
        and not c.is_archived
        and not (public.messagex_current_username() = any (coalesce(c.hidden_for, array[]::text[])))
    )
  );

drop policy if exists messagex_media_queue_select on storage.objects;
create policy messagex_media_queue_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'messagex-media-queue'
    and owner_id = (select auth.uid())::text
  );

drop policy if exists messagex_media_queue_delete on storage.objects;
create policy messagex_media_queue_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'messagex-media-queue'
    and owner_id = (select auth.uid())::text
  );

create or replace function public.messagex_enqueue_media(
  p_queue_id uuid,
  p_chat_id uuid,
  p_sender text,
  p_sender_user_id uuid,
  p_object_path text,
  p_media_type text,
  p_original_name text,
  p_size_bytes bigint,
  p_sha256 text,
  p_sent_at timestamptz,
  p_text text default null,
  p_reply_to_id bigint default null
)
returns table (queue_id uuid, message_id bigint, media_url text, created_at timestamptz)
language plpgsql
set search_path = ''
as $$
declare
  inserted_message public.messages%rowtype;
  existing_queue public.messagex_media_queue%rowtype;
begin
  select * into existing_queue
  from public.messagex_media_queue q
  where q.id = p_queue_id;

  if found then
    if existing_queue.sender_user_id <> p_sender_user_id
       or existing_queue.chat_id <> p_chat_id
       or existing_queue.object_path <> p_object_path then
      raise exception 'Queue identifier already belongs to another upload';
    end if;
    return query
      select existing_queue.id, existing_queue.message_id,
             'messagex-queued:' || existing_queue.id::text, existing_queue.sent_at;
    return;
  end if;

  if p_size_bytes <= 0 or p_size_bytes > 104857600 then
    raise exception 'Invalid queued media size';
  end if;
  if p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid queued media checksum';
  end if;
  if p_media_type !~ '^(image|video|audio)/' then
    raise exception 'Invalid queued media type';
  end if;
  if p_object_path !~ ('^' || p_sender_user_id::text || '/' || p_chat_id::text || '/' || p_queue_id::text || '/[a-zA-Z0-9._-]{1,180}$') then
    raise exception 'Invalid queued media path';
  end if;
  if p_sent_at < now() - interval '1 day' or p_sent_at > now() + interval '5 minutes' then
    raise exception 'Invalid sent timestamp';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.auth_user_id = p_sender_user_id
      and p.username = p_sender
      and not p.is_banned
  ) then
    raise exception 'Invalid or banned MessageX sender';
  end if;
  if not exists (
    select 1 from public.chats c
    where c.id = p_chat_id
      and p_sender = any (c.members)
      and not c.is_archived
      and not (p_sender = any (coalesce(c.hidden_for, array[]::text[])))
  ) then
    raise exception 'Sender is not allowed in this chat';
  end if;

  insert into public.messages (
    chat_id, sender, text, media_url, media_type, reply_to_id, created_at, read_by
  ) values (
    p_chat_id, p_sender, nullif(p_text, ''), 'messagex-queued:' || p_queue_id::text,
    p_media_type, p_reply_to_id, p_sent_at, array[p_sender]::text[]
  ) returning * into inserted_message;

  insert into public.messagex_media_queue (
    id, message_id, chat_id, sender, sender_user_id, object_path, media_type,
    original_name, size_bytes, sha256, sent_at
  ) values (
    p_queue_id, inserted_message.id, p_chat_id, p_sender, p_sender_user_id,
    p_object_path, p_media_type, left(coalesce(nullif(p_original_name, ''), 'upload'), 180),
    p_size_bytes, lower(p_sha256), p_sent_at
  );

  return query
    select p_queue_id, inserted_message.id,
           'messagex-queued:' || p_queue_id::text, inserted_message.created_at;
end;
$$;

create or replace function public.messagex_claim_media_queue()
returns table (
  queue_id uuid,
  message_id bigint,
  chat_id uuid,
  object_path text,
  media_type text,
  original_name text,
  size_bytes bigint,
  sha256 text,
  sent_at timestamptz,
  claim_token uuid,
  attempts integer
)
language plpgsql
set search_path = ''
as $$
begin
  return query
  with candidate as (
    select q.id
    from public.messagex_media_queue q
    where q.storage_deleted_at is null
      and q.message_id is not null
      and (
        (q.status = 'queued' and q.next_attempt_at <= now())
        or (q.status = 'processing' and q.lease_until < now())
      )
    order by q.sent_at, q.created_at
    for update skip locked
    limit 1
  ), claimed as (
    update public.messagex_media_queue q
    set status = 'processing',
        attempts = q.attempts + 1,
        lease_until = now() + interval '5 minutes',
        claim_token = gen_random_uuid(),
        updated_at = now()
    from candidate c
    where q.id = c.id
    returning q.*
  )
  select c.id, c.message_id, c.chat_id, c.object_path, c.media_type,
         c.original_name, c.size_bytes, c.sha256, c.sent_at,
         c.claim_token, c.attempts
  from claimed c;
end;
$$;

create or replace function public.messagex_complete_media_queue(
  p_queue_id uuid,
  p_claim_token uuid,
  p_laptop_media_url text,
  p_size_bytes bigint,
  p_sha256 text
)
returns table (object_path text, message_id bigint, laptop_media_url text)
language plpgsql
set search_path = ''
as $$
declare
  queued public.messagex_media_queue%rowtype;
begin
  select * into queued
  from public.messagex_media_queue q
  where q.id = p_queue_id
  for update;

  if not found then raise exception 'Queued media does not exist'; end if;
  if queued.status = 'completed' then
    return query select queued.object_path, queued.message_id, queued.laptop_media_url;
    return;
  end if;
  if queued.status <> 'processing' or queued.claim_token <> p_claim_token then
    raise exception 'Queued media claim is no longer valid';
  end if;
  if queued.size_bytes <> p_size_bytes or queued.sha256 <> lower(p_sha256) then
    raise exception 'Laptop media verification did not match the queued object';
  end if;
  if p_laptop_media_url !~ '^messagex-laptop:/media/[a-f0-9]{32}/[a-f0-9-]{36}\.[a-z0-9]+$' then
    raise exception 'Invalid laptop media reference';
  end if;

  perform set_config('messagex.internal_message_mutation', 'on', true);
  update public.messages m
  set media_url = p_laptop_media_url
  where m.id = queued.message_id
    and m.chat_id = queued.chat_id
    and m.media_url = 'messagex-queued:' || queued.id::text;

  if not found then raise exception 'The queued MessageX message is missing or changed'; end if;

  update public.messagex_media_queue q
  set status = 'completed',
      laptop_media_url = p_laptop_media_url,
      completed_at = now(),
      lease_until = null,
      claim_token = null,
      last_error = null,
      updated_at = now()
  where q.id = queued.id;

  return query select queued.object_path, queued.message_id, p_laptop_media_url;
end;
$$;

create or replace function public.messagex_fail_media_queue(
  p_queue_id uuid,
  p_claim_token uuid,
  p_error text
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  changed integer;
begin
  update public.messagex_media_queue q
  set status = 'queued',
      lease_until = null,
      claim_token = null,
      last_error = left(coalesce(p_error, 'Laptop queue transfer failed'), 500),
      next_attempt_at = now() + make_interval(secs => least(300, greatest(5, (power(2, least(q.attempts, 8)))::integer))),
      updated_at = now()
  where q.id = p_queue_id
    and q.status = 'processing'
    and q.claim_token = p_claim_token;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

create or replace function public.messagex_mark_queue_storage_deleted(p_queue_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  changed integer;
begin
  update public.messagex_media_queue q
  set storage_deleted_at = coalesce(q.storage_deleted_at, now()), updated_at = now()
  where q.id = p_queue_id and q.status in ('completed', 'cancelled');
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

create or replace function public.messagex_cancel_queued_media_on_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.media_url ~ '^messagex-queued:[0-9a-f-]{36}$' then
    update public.messagex_media_queue q
    set status = 'cancelled', message_id = null, lease_until = null,
        claim_token = null, updated_at = now()
    where q.id = substring(old.media_url from 17)::uuid
      and q.status in ('queued', 'processing');
  end if;
  return old;
end;
$$;

drop trigger if exists messagex_cancel_queued_media_before_delete on public.messages;
create trigger messagex_cancel_queued_media_before_delete
before delete on public.messages
for each row execute function public.messagex_cancel_queued_media_on_delete();

revoke all on table public.messagex_media_queue from anon, authenticated;
grant select on table public.messagex_media_queue to authenticated;

revoke all on function public.messagex_enqueue_media(uuid, uuid, text, uuid, text, text, text, bigint, text, timestamptz, text, bigint) from public, anon, authenticated;
revoke all on function public.messagex_claim_media_queue() from public, anon, authenticated;
revoke all on function public.messagex_complete_media_queue(uuid, uuid, text, bigint, text) from public, anon, authenticated;
revoke all on function public.messagex_fail_media_queue(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.messagex_mark_queue_storage_deleted(uuid) from public, anon, authenticated;
grant execute on function public.messagex_enqueue_media(uuid, uuid, text, uuid, text, text, text, bigint, text, timestamptz, text, bigint) to service_role;
grant execute on function public.messagex_claim_media_queue() to service_role;
grant execute on function public.messagex_complete_media_queue(uuid, uuid, text, bigint, text) to service_role;
grant execute on function public.messagex_fail_media_queue(uuid, uuid, text) to service_role;
grant execute on function public.messagex_mark_queue_storage_deleted(uuid) to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messagex_media_queue'
  ) then
    alter publication supabase_realtime add table public.messagex_media_queue;
  end if;
end;
$$;
