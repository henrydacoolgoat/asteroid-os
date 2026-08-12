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

  -- The existing message guard only permits this internal flag. This function is
  -- executable by service_role alone, so browser users cannot use it to rewrite media.
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

revoke all on function public.messagex_complete_media_queue(uuid, uuid, text, bigint, text)
  from public, anon, authenticated;
grant execute on function public.messagex_complete_media_queue(uuid, uuid, text, bigint, text)
  to service_role;
