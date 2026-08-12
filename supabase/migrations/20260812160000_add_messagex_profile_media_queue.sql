alter table public.messagex_media_queue
  alter column chat_id drop not null;

alter table public.messagex_media_queue
  add column if not exists kind text not null default 'message',
  add column if not exists profile_username text;

alter table public.messagex_media_queue
  drop constraint if exists messagex_media_queue_kind_check;
alter table public.messagex_media_queue
  add constraint messagex_media_queue_kind_check
  check (kind in ('message', 'profile'));

alter table public.messagex_media_queue
  drop constraint if exists messagex_media_queue_target_check;
alter table public.messagex_media_queue
  add constraint messagex_media_queue_target_check
  check (
    (kind = 'message' and chat_id is not null and message_id is not null and profile_username is null)
    or (kind = 'profile' and chat_id is null and message_id is null and profile_username is not null)
  ) not valid;
alter table public.messagex_media_queue validate constraint messagex_media_queue_target_check;

drop policy if exists messagex_media_queue_read on public.messagex_media_queue;
create policy messagex_media_queue_read
  on public.messagex_media_queue
  for select
  to authenticated
  using (
    (kind = 'profile' and sender_user_id = (select auth.uid()))
    or exists (
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
    and (storage.foldername(storage.objects.name))[1] = (select auth.uid())::text
    and array_length(storage.foldername(storage.objects.name), 1) = 3
    and (storage.foldername(storage.objects.name))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and (
      (
        (storage.foldername(storage.objects.name))[2] = 'profile'
        and exists (
          select 1 from public.profiles p
          where p.auth_user_id = (select auth.uid())
            and not p.is_banned
        )
      )
      or (
        (storage.foldername(storage.objects.name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and exists (
          select 1 from public.chats c
          where c.id = ((storage.foldername(storage.objects.name))[2])::uuid
            and public.messagex_current_username() = any (c.members)
            and not c.is_archived
            and not (public.messagex_current_username() = any (coalesce(c.hidden_for, array[]::text[])))
        )
      )
    )
  );

create or replace function public.messagex_guard_profile_update()
returns trigger
language plpgsql
set search_path = 'pg_catalog', 'public'
as $$
begin
  if current_setting('asteroid.internal_username_migration',true) = 'on' then return new; end if;
  if current_setting('messagex.internal_profile_mutation',true) = 'on' then return new; end if;
  if public.messagex_is_admin() then return new; end if;
  if old.auth_user_id is distinct from (select auth.uid()) then
    raise exception using errcode='42501', message='Profile access denied.';
  end if;
  if new.username is distinct from old.username
     or new.auth_user_id is distinct from old.auth_user_id
     or new.is_admin is distinct from old.is_admin
     or new.filter_bypass is distinct from old.filter_bypass
     or new.is_banned is distinct from old.is_banned
     or new.ban_until is distinct from old.ban_until
     or new.ban_reason is distinct from old.ban_reason
     or new.banned_at is distinct from old.banned_at
     or new.banned_by is distinct from old.banned_by
     or new.is_approved is distinct from old.is_approved
     or new.signup_invite_code is distinct from old.signup_invite_code then
    raise exception using errcode='42501', message='Protected profile fields cannot be changed.';
  end if;
  if char_length(coalesce(new.display_name,'')) > 60 then raise exception 'Display name is too long.'; end if;
  if char_length(coalesce(new.bio,'')) > 500 then raise exception 'Bio is too long.'; end if;
  if new.avatar_url is not null and char_length(new.avatar_url) > 900000 then raise exception 'Profile photo is too large.'; end if;
  if new.avatar_url is not null and btrim(new.avatar_url) <> ''
     and new.avatar_url !~* '^(https://|data:image/|messagex-profile-laptop:/media/[a-f0-9]{32}/[a-f0-9-]{36}\.[a-z0-9]+$|messagex-profile-queued:[0-9a-f-]{36}$)' then
    raise exception 'Unsupported profile photo URL.';
  end if;
  return new;
end;
$$;

create or replace function public.messagex_set_profile_media(
  p_sender_user_id uuid,
  p_profile_username text,
  p_avatar_url text
)
returns table (username text, avatar_url text, profile_updated_at timestamptz)
language plpgsql
set search_path = ''
as $$
begin
  if p_avatar_url !~ '^messagex-profile-laptop:/media/[a-f0-9]{32}/[a-f0-9-]{36}\.[a-z0-9]+$' then
    raise exception 'Invalid laptop profile media reference';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.auth_user_id = p_sender_user_id and p.username = p_profile_username and not p.is_banned
  ) then raise exception 'Invalid profile owner'; end if;
  perform set_config('messagex.internal_profile_mutation', 'on', true);
  return query
  update public.profiles p
  set avatar_url = p_avatar_url, profile_updated_at = now()
  where p.auth_user_id = p_sender_user_id and p.username = p_profile_username
  returning p.username, p.avatar_url, p.profile_updated_at;
end;
$$;

create or replace function public.messagex_enqueue_profile_media(
  p_queue_id uuid,
  p_sender_user_id uuid,
  p_profile_username text,
  p_object_path text,
  p_media_type text,
  p_original_name text,
  p_size_bytes bigint,
  p_sha256 text,
  p_sent_at timestamptz
)
returns table (queue_id uuid, profile_username text, avatar_url text, created_at timestamptz)
language plpgsql
set search_path = ''
as $$
declare existing_queue public.messagex_media_queue%rowtype;
begin
  select * into existing_queue from public.messagex_media_queue q where q.id=p_queue_id;
  if found then
    if existing_queue.sender_user_id<>p_sender_user_id or existing_queue.profile_username<>p_profile_username then
      raise exception 'Queue identifier already belongs to another upload';
    end if;
    return query select existing_queue.id, existing_queue.profile_username,
      'messagex-profile-queued:'||existing_queue.id::text, existing_queue.sent_at;
    return;
  end if;
  if p_size_bytes<=0 or p_size_bytes>104857600 or p_sha256 !~ '^[0-9a-f]{64}$'
     or p_media_type !~ '^image/' then raise exception 'Invalid profile media'; end if;
  if p_object_path !~ ('^'||p_sender_user_id::text||'/profile/'||p_queue_id::text||'/[a-zA-Z0-9._-]{1,180}$') then
    raise exception 'Invalid queued profile media path';
  end if;
  if p_sent_at<now()-interval '1 day' or p_sent_at>now()+interval '5 minutes' then raise exception 'Invalid sent timestamp'; end if;
  if not exists (
    select 1 from public.profiles p where p.auth_user_id=p_sender_user_id
      and p.username=p_profile_username and not p.is_banned
  ) then raise exception 'Invalid profile owner'; end if;

  insert into public.messagex_media_queue(
    id,kind,profile_username,sender,sender_user_id,object_path,media_type,
    original_name,size_bytes,sha256,sent_at
  ) values (
    p_queue_id,'profile',p_profile_username,p_profile_username,p_sender_user_id,p_object_path,
    p_media_type,left(coalesce(nullif(p_original_name,''),'profile.jpg'),180),p_size_bytes,lower(p_sha256),p_sent_at
  );
  perform set_config('messagex.internal_profile_mutation','on',true);
  update public.profiles p set avatar_url='messagex-profile-queued:'||p_queue_id::text,
    profile_updated_at=p_sent_at where p.auth_user_id=p_sender_user_id and p.username=p_profile_username;
  return query select p_queue_id,p_profile_username,'messagex-profile-queued:'||p_queue_id::text,p_sent_at;
end;
$$;

drop function if exists public.messagex_claim_media_queue();
create function public.messagex_claim_media_queue()
returns table (
  queue_id uuid,message_id bigint,chat_id uuid,kind text,profile_username text,
  object_path text,media_type text,original_name text,size_bytes bigint,sha256 text,
  sent_at timestamptz,claim_token uuid,attempts integer
)
language plpgsql
set search_path=''
as $$
begin
  return query
  with candidate as (
    select q.id from public.messagex_media_queue q
    where q.storage_deleted_at is null
      and ((q.kind='message' and q.message_id is not null) or q.kind='profile')
      and ((q.status='queued' and q.next_attempt_at<=now()) or (q.status='processing' and q.lease_until<now()))
    order by q.sent_at,q.created_at for update skip locked limit 1
  ), claimed as (
    update public.messagex_media_queue q set status='processing',attempts=q.attempts+1,
      lease_until=now()+interval '5 minutes',claim_token=gen_random_uuid(),updated_at=now()
    from candidate c where q.id=c.id returning q.*
  )
  select c.id,c.message_id,c.chat_id,c.kind,c.profile_username,c.object_path,c.media_type,
    c.original_name,c.size_bytes,c.sha256,c.sent_at,c.claim_token,c.attempts from claimed c;
end;
$$;

create or replace function public.messagex_complete_media_queue(
  p_queue_id uuid,p_claim_token uuid,p_laptop_media_url text,p_size_bytes bigint,p_sha256 text
)
returns table(object_path text,message_id bigint,laptop_media_url text)
language plpgsql
set search_path=''
as $$
declare queued public.messagex_media_queue%rowtype;
begin
  select * into queued from public.messagex_media_queue q where q.id=p_queue_id for update;
  if not found then raise exception 'Queued media does not exist'; end if;
  if queued.status='completed' then return query select queued.object_path,queued.message_id,queued.laptop_media_url; return; end if;
  if queued.status<>'processing' or queued.claim_token<>p_claim_token then raise exception 'Queued media claim is no longer valid'; end if;
  if queued.size_bytes<>p_size_bytes or queued.sha256<>lower(p_sha256) then raise exception 'Laptop media verification did not match'; end if;
  if queued.kind='message' then
    if p_laptop_media_url !~ '^messagex-laptop:/media/[a-f0-9]{32}/[a-f0-9-]{36}\.[a-z0-9]+$' then raise exception 'Invalid message media reference'; end if;
    perform set_config('messagex.internal_message_mutation','on',true);
    update public.messages m set media_url=p_laptop_media_url where m.id=queued.message_id and m.chat_id=queued.chat_id
      and m.media_url='messagex-queued:'||queued.id::text;
  else
    if p_laptop_media_url !~ '^messagex-profile-laptop:/media/[a-f0-9]{32}/[a-f0-9-]{36}\.[a-z0-9]+$' then raise exception 'Invalid profile media reference'; end if;
    perform set_config('messagex.internal_profile_mutation','on',true);
    update public.profiles p set avatar_url=p_laptop_media_url,profile_updated_at=now()
      where p.auth_user_id=queued.sender_user_id and p.username=queued.profile_username
        and p.avatar_url='messagex-profile-queued:'||queued.id::text;
  end if;
  if not found then raise exception 'The queued MessageX target is missing or changed'; end if;
  update public.messagex_media_queue q set status='completed',laptop_media_url=p_laptop_media_url,
    completed_at=now(),lease_until=null,claim_token=null,last_error=null,updated_at=now() where q.id=queued.id;
  return query select queued.object_path,queued.message_id,p_laptop_media_url;
end;
$$;

create or replace function public.messagex_cancel_queued_profile_on_change()
returns trigger language plpgsql set search_path='' as $$
begin
  if old.avatar_url~'^messagex-profile-queued:[0-9a-f-]{36}$' and new.avatar_url is distinct from old.avatar_url then
    update public.messagex_media_queue q set status='cancelled',lease_until=null,claim_token=null,updated_at=now()
      where q.id=substring(old.avatar_url from 25)::uuid and q.status in('queued','processing');
  end if;
  return new;
end;
$$;
drop trigger if exists messagex_cancel_queued_profile_before_change on public.profiles;
create trigger messagex_cancel_queued_profile_before_change before update of avatar_url on public.profiles
for each row execute function public.messagex_cancel_queued_profile_on_change();

revoke all on function public.messagex_set_profile_media(uuid,text,text) from public,anon,authenticated;
revoke all on function public.messagex_enqueue_profile_media(uuid,uuid,text,text,text,text,bigint,text,timestamptz) from public,anon,authenticated;
revoke all on function public.messagex_claim_media_queue() from public,anon,authenticated;
revoke all on function public.messagex_complete_media_queue(uuid,uuid,text,bigint,text) from public,anon,authenticated;
grant execute on function public.messagex_set_profile_media(uuid,text,text) to service_role;
grant execute on function public.messagex_enqueue_profile_media(uuid,uuid,text,text,text,text,bigint,text,timestamptz) to service_role;
grant execute on function public.messagex_claim_media_queue() to service_role;
grant execute on function public.messagex_complete_media_queue(uuid,uuid,text,bigint,text) to service_role;
