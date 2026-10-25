-- Evil AI mode for everyone: while evil_ai_until is in the future, the /ai bot answers every
-- player rudely. Per-player evil mode is stored in profiles.stats.evilAiUntil and needs no column.

-- Some databases never ran 0010, so make sure the settings table exists first.
create table if not exists public.app_settings (
  id smallint primary key default 1,
  maintenance_mode boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint app_settings_singleton check (id = 1)
);
insert into public.app_settings (id, maintenance_mode) values (1, false) on conflict (id) do nothing;
alter table public.app_settings enable row level security;
drop policy if exists app_settings_public_read on public.app_settings;
create policy app_settings_public_read on public.app_settings for select to anon, authenticated using (true);

alter table public.app_settings add column if not exists evil_ai_until timestamptz;
