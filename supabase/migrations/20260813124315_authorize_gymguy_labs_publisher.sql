-- Asteroid Labs publishing is authorized by the stable Supabase Auth user ID,
-- never by user-editable profile metadata or a client-side secret.
grant select, insert, update, delete on table public.asteroid_labs_projects to authenticated;

drop policy if exists "Gymguy can view all Asteroid Labs projects" on public.asteroid_labs_projects;
create policy "Gymguy can view all Asteroid Labs projects"
on public.asteroid_labs_projects
for select
to authenticated
using ((select auth.uid()) = '1086ef13-6491-4e74-80d6-57dd5fa17c71'::uuid);

drop policy if exists "Gymguy can add Asteroid Labs projects" on public.asteroid_labs_projects;
create policy "Gymguy can add Asteroid Labs projects"
on public.asteroid_labs_projects
for insert
to authenticated
with check ((select auth.uid()) = '1086ef13-6491-4e74-80d6-57dd5fa17c71'::uuid);

drop policy if exists "Gymguy can update Asteroid Labs projects" on public.asteroid_labs_projects;
create policy "Gymguy can update Asteroid Labs projects"
on public.asteroid_labs_projects
for update
to authenticated
using ((select auth.uid()) = '1086ef13-6491-4e74-80d6-57dd5fa17c71'::uuid)
with check ((select auth.uid()) = '1086ef13-6491-4e74-80d6-57dd5fa17c71'::uuid);

drop policy if exists "Gymguy can delete Asteroid Labs projects" on public.asteroid_labs_projects;
create policy "Gymguy can delete Asteroid Labs projects"
on public.asteroid_labs_projects
for delete
to authenticated
using ((select auth.uid()) = '1086ef13-6491-4e74-80d6-57dd5fa17c71'::uuid);

-- Remove the demonstration roadmap entries. The public page now stays empty
-- until gymguy publishes a real Asteroid Labs project.
delete from public.asteroid_labs_projects
where slug in (
  'asteroid-one-snapshots',
  'comet-live-rooms',
  'project-helios',
  'asteroid-spaces',
  'orbit-browser-engine',
  'touchplay-tv'
);

create table if not exists public.asteroid_labs_feature_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  requester_username text not null check (char_length(requester_username) between 1 and 80),
  title text not null check (char_length(title) between 1 and 100),
  details text not null check (char_length(details) between 1 and 1000),
  status text not null default 'new' check (status in ('new', 'reviewing', 'planned', 'declined', 'done')),
  owner_note text not null default '' check (char_length(owner_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.asteroid_labs_feature_requests is
  'Feature ideas submitted by authenticated Asteroid accounts and privately reviewed by the Asteroid Labs owner.';

alter table public.asteroid_labs_feature_requests enable row level security;
revoke all on table public.asteroid_labs_feature_requests from anon, authenticated;
grant select, insert, update, delete on table public.asteroid_labs_feature_requests to authenticated;

drop policy if exists "Users can submit their own Labs feature requests" on public.asteroid_labs_feature_requests;
create policy "Users can submit their own Labs feature requests"
on public.asteroid_labs_feature_requests
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can view their own Labs feature requests" on public.asteroid_labs_feature_requests;
create policy "Users can view their own Labs feature requests"
on public.asteroid_labs_feature_requests
for select
to authenticated
using (
  (select auth.uid()) = user_id
  or (select auth.uid()) = '1086ef13-6491-4e74-80d6-57dd5fa17c71'::uuid
);

drop policy if exists "Gymguy can review Labs feature requests" on public.asteroid_labs_feature_requests;
create policy "Gymguy can review Labs feature requests"
on public.asteroid_labs_feature_requests
for update
to authenticated
using ((select auth.uid()) = '1086ef13-6491-4e74-80d6-57dd5fa17c71'::uuid)
with check ((select auth.uid()) = '1086ef13-6491-4e74-80d6-57dd5fa17c71'::uuid);

drop policy if exists "Gymguy can delete Labs feature requests" on public.asteroid_labs_feature_requests;
create policy "Gymguy can delete Labs feature requests"
on public.asteroid_labs_feature_requests
for delete
to authenticated
using ((select auth.uid()) = '1086ef13-6491-4e74-80d6-57dd5fa17c71'::uuid);

create index if not exists asteroid_labs_feature_requests_owner_created_idx
  on public.asteroid_labs_feature_requests (user_id, created_at desc);

create index if not exists asteroid_labs_feature_requests_status_created_idx
  on public.asteroid_labs_feature_requests (status, created_at desc);
