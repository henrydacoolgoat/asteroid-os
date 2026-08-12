-- Cover the transfer queue's two foreign keys for ownership cleanup and
-- file-specific recovery lookups. This also satisfies the Supabase advisor.
create index if not exists asteroid_one_transfer_file_idx
  on public.asteroid_one_transfer_queue(file_id);

create index if not exists asteroid_one_transfer_owner_idx
  on public.asteroid_one_transfer_queue(owner_user_id);
