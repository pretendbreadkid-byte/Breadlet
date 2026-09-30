-- Server-persisted app settings so maintenance mode can be toggled from the Admin tab
-- and read by every client (including signed-out visitors) before login.
create table if not exists public.app_settings (
  id smallint primary key default 1,
  maintenance_mode boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint app_settings_singleton check (id = 1)
);

insert into public.app_settings (id, maintenance_mode)
values (1, false)
on conflict (id) do nothing;

alter table public.app_settings enable row level security;

create policy app_settings_public_read on public.app_settings
  for select
  to anon, authenticated
  using (true);

-- Daily Crate: track when it was last spun so it can reset every calendar day
-- instead of staying locked forever after the first open.
-- (stored inside profiles.stats as wheelSpunAt; no column change needed)
