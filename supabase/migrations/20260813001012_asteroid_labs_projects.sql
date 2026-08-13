create table if not exists public.asteroid_labs_projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null check (char_length(title) between 1 and 80),
  summary text not null default '' check (char_length(summary) <= 600),
  status text not null check (status in ('future', 'development', 'archived', 'canceled')),
  stage text not null default 'Concept' check (char_length(stage) <= 40),
  target_label text not null default '' check (char_length(target_label) <= 60),
  tags text[] not null default '{}',
  accent text not null default '#ffffff' check (accent ~ '^#[0-9a-fA-F]{6}$'),
  display_order integer not null default 0,
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.asteroid_labs_projects is
  'Public, read-only Asteroid Labs roadmap. Mutations are performed only by the protected asteroid-labs-admin Edge Function.';

alter table public.asteroid_labs_projects enable row level security;

revoke all on table public.asteroid_labs_projects from anon, authenticated;
grant select on table public.asteroid_labs_projects to anon, authenticated;

drop policy if exists "Public can view visible Asteroid Labs projects" on public.asteroid_labs_projects;
create policy "Public can view visible Asteroid Labs projects"
on public.asteroid_labs_projects
for select
to anon, authenticated
using (visible = true);

create index if not exists asteroid_labs_projects_public_order_idx
  on public.asteroid_labs_projects (status, display_order, updated_at desc)
  where visible = true;

insert into public.asteroid_labs_projects
  (slug, title, summary, status, stage, target_label, tags, accent, display_order)
values
  ('asteroid-one-snapshots', 'Asteroid ONE Snapshots', 'A private timeline of files, settings, and device state stored on your own Asteroid ONE laptop.', 'development', 'Prototype', 'In active testing', array['Storage', 'Multi-device'], '#ffffff', 10),
  ('comet-live-rooms', 'Comet Live Rooms', 'Low-latency voice rooms built for quick conversations across Asteroid OS devices.', 'development', 'Alpha', 'Voice reliability pass', array['Voice', 'Realtime'], '#b9d7ff', 20),
  ('project-helios', 'Project Helios', 'A seamless handoff layer that lets an Asteroid session continue on a phone, tablet, or desktop.', 'future', 'Research', 'Exploration', array['Continuity', 'Devices'], '#ffe6aa', 10),
  ('asteroid-spaces', 'Asteroid Spaces', 'Shared rooms for planning, sketching, playing, and building with friends.', 'future', 'Concept', 'Future project', array['Collaboration', 'Social'], '#d7c8ff', 20),
  ('orbit-browser-engine', 'Orbit Browser Engine', 'An early experiment in a custom browsing surface that later evolved into Asteroid Browser.', 'archived', 'Archived', '2019–2021', array['Browser', 'History'], '#b7bdc8', 10),
  ('touchplay-tv', 'TouchPlay TV', 'A television-first game launcher concept designed around controllers and instant party play.', 'canceled', 'Canceled', 'Closed concept', array['Games', 'TV'], '#ffb8b8', 10)
on conflict (slug) do nothing;
