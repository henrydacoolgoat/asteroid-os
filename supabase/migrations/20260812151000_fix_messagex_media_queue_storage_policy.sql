drop policy if exists messagex_media_queue_insert on storage.objects;
create policy messagex_media_queue_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'messagex-media-queue'
    and (storage.foldername(storage.objects.name))[1] = (select auth.uid())::text
    and array_length(storage.foldername(storage.objects.name), 1) = 3
    and (storage.foldername(storage.objects.name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and (storage.foldername(storage.objects.name))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and exists (
      select 1
      from public.chats c
      where c.id = ((storage.foldername(storage.objects.name))[2])::uuid
        and public.messagex_current_username() = any (c.members)
        and not c.is_archived
        and not (public.messagex_current_username() = any (coalesce(c.hidden_for, array[]::text[])))
    )
  );
