create table if not exists public.asteroid_one_files (
  id text primary key,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  parent_id text not null default 'Home',
  name text not null,
  kind text not null default 'file',
  mime_type text,
  size_bytes bigint not null default 0,
  sha256 text,
  storage_ref text,
  status text not null default 'available',
  queue_id uuid unique,
  created_at timestamptz not null default now(),
  modified_at timestamptz not null default now(),
  laptop_saved_at timestamptz,
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint asteroid_one_files_id_check check (
    id ~ '^(file|folder)-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  constraint asteroid_one_files_parent_check check (
    parent_id in ('Home','Desktop','Documents','Downloads','Pictures','Music','Videos')
    or parent_id ~ '^folder-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  constraint asteroid_one_files_name_check check (
    char_length(name) between 1 and 180 and name !~ '[\\/:*?"<>|]'
  ),
  constraint asteroid_one_files_kind_check check (kind in ('file','folder')),
  constraint asteroid_one_files_status_check check (status in ('queued','available','deleted')),
  constraint asteroid_one_files_shape_check check (
    (kind='folder' and size_bytes=0 and sha256 is null and storage_ref is null and queue_id is null)
    or
    (kind='file' and size_bytes between 1 and 104857600 and sha256 ~ '^[0-9a-f]{64}$' and storage_ref is not null)
  )
);

create index if not exists asteroid_one_files_owner_parent_idx
  on public.asteroid_one_files(owner_user_id,parent_id,modified_at desc);
create index if not exists asteroid_one_files_owner_updated_idx
  on public.asteroid_one_files(owner_user_id,updated_at desc);

alter table public.asteroid_one_files enable row level security;

drop policy if exists asteroid_one_files_select_own on public.asteroid_one_files;
create policy asteroid_one_files_select_own
  on public.asteroid_one_files for select to authenticated
  using (owner_user_id=(select auth.uid()));

drop policy if exists asteroid_one_folders_insert_own on public.asteroid_one_files;
create policy asteroid_one_folders_insert_own
  on public.asteroid_one_files for insert to authenticated
  with check (
    owner_user_id=(select auth.uid()) and kind='folder' and status='available'
    and storage_ref is null and queue_id is null
  );

drop policy if exists asteroid_one_files_update_own on public.asteroid_one_files;
create policy asteroid_one_files_update_own
  on public.asteroid_one_files for update to authenticated
  using (owner_user_id=(select auth.uid()))
  with check (owner_user_id=(select auth.uid()));

drop policy if exists asteroid_one_folders_delete_own on public.asteroid_one_files;
create policy asteroid_one_folders_delete_own
  on public.asteroid_one_files for delete to authenticated
  using (owner_user_id=(select auth.uid()) and kind='folder');

revoke all on public.asteroid_one_files from public,anon,authenticated;
grant select on public.asteroid_one_files to authenticated;
grant insert(id,owner_user_id,parent_id,name,kind,status,created_at,modified_at,updated_at)
  on public.asteroid_one_files to authenticated;
grant update(parent_id,name,modified_at,deleted_at,status,updated_at)
  on public.asteroid_one_files to authenticated;
grant delete on public.asteroid_one_files to authenticated;

create table if not exists public.asteroid_one_transfer_queue (
  id uuid primary key,
  file_id text not null references public.asteroid_one_files(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  object_path text not null unique,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  sha256 text not null,
  modified_at timestamptz not null,
  status text not null default 'queued',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  claim_token uuid,
  laptop_storage_ref text,
  last_error text,
  completed_at timestamptz,
  storage_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint asteroid_one_transfer_status_check check (status in ('queued','processing','completed','cancelled')),
  constraint asteroid_one_transfer_size_check check (size_bytes between 1 and 104857600),
  constraint asteroid_one_transfer_sha_check check (sha256 ~ '^[0-9a-f]{64}$')
);

create index if not exists asteroid_one_transfer_ready_idx
  on public.asteroid_one_transfer_queue(status,next_attempt_at,created_at)
  where storage_deleted_at is null;

alter table public.asteroid_one_transfer_queue enable row level security;
drop policy if exists asteroid_one_transfer_select_own on public.asteroid_one_transfer_queue;
create policy asteroid_one_transfer_select_own
  on public.asteroid_one_transfer_queue for select to authenticated
  using (owner_user_id=(select auth.uid()));
revoke all on public.asteroid_one_transfer_queue from public,anon,authenticated;
grant select on public.asteroid_one_transfer_queue to authenticated;

drop policy if exists messagex_media_queue_insert on storage.objects;
create policy messagex_media_queue_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id='messagex-media-queue'
    and (storage.foldername(storage.objects.name))[1]=(select auth.uid())::text
    and array_length(storage.foldername(storage.objects.name),1)=3
    and (storage.foldername(storage.objects.name))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and (
      ((storage.foldername(storage.objects.name))[2]='profile' and exists(
        select 1 from public.profiles p where p.auth_user_id=(select auth.uid()) and not p.is_banned
      ))
      or ((storage.foldername(storage.objects.name))[2]='asteroid-one' and exists(
        select 1 from public.profiles p where p.auth_user_id=(select auth.uid()) and not p.is_banned
      ))
      or ((storage.foldername(storage.objects.name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' and exists(
        select 1 from public.chats c
        where c.id=((storage.foldername(storage.objects.name))[2])::uuid
          and public.messagex_current_username()=any(c.members)
          and not c.is_archived
          and not (public.messagex_current_username()=any(coalesce(c.hidden_for,array[]::text[])))
      ))
    )
  );

create or replace function public.asteroid_one_register_file(
  p_file_id text,p_owner_user_id uuid,p_parent_id text,p_name text,p_mime_type text,
  p_size_bytes bigint,p_sha256 text,p_storage_ref text,p_modified_at timestamptz
)
returns setof public.asteroid_one_files language plpgsql set search_path='' as $$
begin
  if p_file_id !~ '^(file)-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or p_parent_id !~ '^(Home|Desktop|Documents|Downloads|Pictures|Music|Videos|folder-[0-9a-f-]{36})$'
     or char_length(p_name) not between 1 and 180 or p_name ~ '[\\/:*?"<>|]'
     or p_size_bytes not between 1 and 104857600 or p_sha256 !~ '^[0-9a-f]{64}$'
     or p_storage_ref !~ '^asteroid-one:/files/[a-f0-9]{32}/file-[0-9a-f-]{36}\.[a-z0-9]{1,10}$'
     or p_modified_at<now()-interval '20 years' or p_modified_at>now()+interval '5 minutes' then
    raise exception 'Invalid Asteroid ONE file metadata';
  end if;
  return query
  insert into public.asteroid_one_files(
    id,owner_user_id,parent_id,name,kind,mime_type,size_bytes,sha256,storage_ref,status,
    queue_id,created_at,modified_at,laptop_saved_at,updated_at
  ) values (
    p_file_id,p_owner_user_id,p_parent_id,p_name,'file',coalesce(nullif(p_mime_type,''),'application/octet-stream'),
    p_size_bytes,lower(p_sha256),p_storage_ref,'available',null,p_modified_at,p_modified_at,now(),now()
  ) on conflict(id) do update set
    parent_id=excluded.parent_id,name=excluded.name,mime_type=excluded.mime_type,
    size_bytes=excluded.size_bytes,sha256=excluded.sha256,storage_ref=excluded.storage_ref,
    status='available',queue_id=null,modified_at=excluded.modified_at,laptop_saved_at=now(),
    deleted_at=null,updated_at=now()
  where public.asteroid_one_files.owner_user_id=excluded.owner_user_id
  returning *;
end $$;

create or replace function public.asteroid_one_enqueue_file(
  p_queue_id uuid,p_file_id text,p_owner_user_id uuid,p_parent_id text,p_name text,
  p_object_path text,p_mime_type text,p_size_bytes bigint,p_sha256 text,p_modified_at timestamptz
)
returns setof public.asteroid_one_files language plpgsql set search_path='' as $$
begin
  if p_file_id !~ '^file-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or p_parent_id !~ '^(Home|Desktop|Documents|Downloads|Pictures|Music|Videos|folder-[0-9a-f-]{36})$'
     or char_length(p_name) not between 1 and 180 or p_name ~ '[\\/:*?"<>|]'
     or p_size_bytes not between 1 and 104857600 or p_sha256 !~ '^[0-9a-f]{64}$'
     or p_object_path !~ ('^'||p_owner_user_id::text||'/asteroid-one/'||p_queue_id::text||'/[a-zA-Z0-9._-]{1,180}$')
     or p_modified_at<now()-interval '20 years' or p_modified_at>now()+interval '5 minutes' then
    raise exception 'Invalid queued Asteroid ONE file';
  end if;
  insert into public.asteroid_one_files(
    id,owner_user_id,parent_id,name,kind,mime_type,size_bytes,sha256,storage_ref,status,
    queue_id,created_at,modified_at,updated_at
  ) values (
    p_file_id,p_owner_user_id,p_parent_id,p_name,'file',coalesce(nullif(p_mime_type,''),'application/octet-stream'),
    p_size_bytes,lower(p_sha256),'asteroid-one-queued:'||p_queue_id::text,'queued',p_queue_id,
    p_modified_at,p_modified_at,now()
  ) on conflict(id) do update set
    parent_id=excluded.parent_id,name=excluded.name,mime_type=excluded.mime_type,size_bytes=excluded.size_bytes,
    sha256=excluded.sha256,storage_ref=excluded.storage_ref,status='queued',queue_id=excluded.queue_id,
    modified_at=excluded.modified_at,deleted_at=null,updated_at=now()
  where public.asteroid_one_files.owner_user_id=excluded.owner_user_id;
  insert into public.asteroid_one_transfer_queue(
    id,file_id,owner_user_id,object_path,original_name,mime_type,size_bytes,sha256,modified_at
  ) values (
    p_queue_id,p_file_id,p_owner_user_id,p_object_path,p_name,
    coalesce(nullif(p_mime_type,''),'application/octet-stream'),p_size_bytes,lower(p_sha256),p_modified_at
  ) on conflict(id) do nothing;
  return query select * from public.asteroid_one_files f where f.id=p_file_id and f.owner_user_id=p_owner_user_id;
end $$;

create or replace function public.asteroid_one_claim_transfer()
returns table(
  queue_id uuid,file_id text,owner_user_id uuid,object_path text,original_name text,
  mime_type text,size_bytes bigint,sha256 text,modified_at timestamptz,claim_token uuid,attempts integer
) language plpgsql set search_path='' as $$
begin
  return query with candidate as (
    select q.id from public.asteroid_one_transfer_queue q
    where q.storage_deleted_at is null and (
      (q.status='queued' and q.next_attempt_at<=now()) or
      (q.status='processing' and q.lease_until<now())
    ) order by q.created_at for update skip locked limit 1
  ), claimed as (
    update public.asteroid_one_transfer_queue q set status='processing',attempts=q.attempts+1,
      lease_until=now()+interval '5 minutes',claim_token=gen_random_uuid(),updated_at=now()
    from candidate c where q.id=c.id returning q.*
  ) select c.id,c.file_id,c.owner_user_id,c.object_path,c.original_name,c.mime_type,
    c.size_bytes,c.sha256,c.modified_at,c.claim_token,c.attempts from claimed c;
end $$;

create or replace function public.asteroid_one_complete_transfer(
  p_queue_id uuid,p_claim_token uuid,p_storage_ref text,p_size_bytes bigint,p_sha256 text
) returns table(object_path text,file_id text,storage_ref text)
language plpgsql set search_path='' as $$
declare queued public.asteroid_one_transfer_queue%rowtype;
begin
  select * into queued from public.asteroid_one_transfer_queue q where q.id=p_queue_id for update;
  if not found then raise exception 'Queued Asteroid ONE file does not exist'; end if;
  if queued.status='completed' then return query select queued.object_path,queued.file_id,queued.laptop_storage_ref; return; end if;
  if queued.status<>'processing' or queued.claim_token<>p_claim_token then raise exception 'Asteroid ONE claim is no longer valid'; end if;
  if queued.size_bytes<>p_size_bytes or queued.sha256<>lower(p_sha256) then raise exception 'Asteroid ONE verification did not match'; end if;
  if p_storage_ref !~ '^asteroid-one:/files/[a-f0-9]{32}/file-[0-9a-f-]{36}\.[a-z0-9]{1,10}$' then raise exception 'Invalid Asteroid ONE reference'; end if;
  update public.asteroid_one_files f set storage_ref=p_storage_ref,status='available',queue_id=null,
    laptop_saved_at=now(),updated_at=now()
  where f.id=queued.file_id and f.owner_user_id=queued.owner_user_id
    and f.storage_ref='asteroid-one-queued:'||queued.id::text;
  if not found then raise exception 'Asteroid ONE file target changed'; end if;
  update public.asteroid_one_transfer_queue q set status='completed',laptop_storage_ref=p_storage_ref,
    completed_at=now(),lease_until=null,claim_token=null,last_error=null,updated_at=now() where q.id=queued.id;
  return query select queued.object_path,queued.file_id,p_storage_ref;
end $$;

create or replace function public.asteroid_one_fail_transfer(
  p_queue_id uuid,p_claim_token uuid,p_error text
) returns boolean language plpgsql set search_path='' as $$
declare changed integer;
begin
  update public.asteroid_one_transfer_queue q set status='queued',lease_until=null,claim_token=null,
    last_error=left(coalesce(p_error,'Transfer failed'),500),
    next_attempt_at=now()+least(interval '15 minutes',make_interval(secs=>greatest(5,power(2,least(q.attempts,9))::integer))),updated_at=now()
  where q.id=p_queue_id and q.status='processing' and q.claim_token=p_claim_token;
  get diagnostics changed=row_count; return changed=1;
end $$;

create or replace function public.asteroid_one_mark_storage_deleted(p_queue_id uuid)
returns boolean language plpgsql set search_path='' as $$
declare changed integer;
begin
  update public.asteroid_one_transfer_queue set storage_deleted_at=coalesce(storage_deleted_at,now()),updated_at=now()
  where id=p_queue_id and status in('completed','cancelled');
  get diagnostics changed=row_count; return changed=1;
end $$;

revoke all on function public.asteroid_one_register_file(text,uuid,text,text,text,bigint,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.asteroid_one_enqueue_file(uuid,text,uuid,text,text,text,text,bigint,text,timestamptz) from public,anon,authenticated;
revoke all on function public.asteroid_one_claim_transfer() from public,anon,authenticated;
revoke all on function public.asteroid_one_complete_transfer(uuid,uuid,text,bigint,text) from public,anon,authenticated;
revoke all on function public.asteroid_one_fail_transfer(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.asteroid_one_mark_storage_deleted(uuid) from public,anon,authenticated;
grant execute on function public.asteroid_one_register_file(text,uuid,text,text,text,bigint,text,text,timestamptz) to service_role;
grant execute on function public.asteroid_one_enqueue_file(uuid,text,uuid,text,text,text,text,bigint,text,timestamptz) to service_role;
grant execute on function public.asteroid_one_claim_transfer() to service_role;
grant execute on function public.asteroid_one_complete_transfer(uuid,uuid,text,bigint,text) to service_role;
grant execute on function public.asteroid_one_fail_transfer(uuid,uuid,text) to service_role;
grant execute on function public.asteroid_one_mark_storage_deleted(uuid) to service_role;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='asteroid_one_files') then
    alter publication supabase_realtime add table public.asteroid_one_files;
  end if;
end $$;
