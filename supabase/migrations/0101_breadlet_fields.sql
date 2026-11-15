-- Breadlet Fields (test, admin only): each player's garden plots and this hour's dig board.
-- Only the server reads or writes it, so the buried prizes can't be peeked at.
create table if not exists public.breadlet_fields (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  rev integer not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.breadlet_fields enable row level security;
revoke all on public.breadlet_fields from anon, authenticated;
