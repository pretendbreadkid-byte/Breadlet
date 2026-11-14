-- Kid accounts: profiles.stats.kidMode turns off chat, trading, the Bazaar, friends, clans and
-- reactions (enforced in the API routes). The grown-up PIN that turns it off lives here, hashed,
-- where players can't read it.
create table if not exists public.kid_mode_pins (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  pin_hash text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.kid_mode_pins enable row level security;
revoke all on public.kid_mode_pins from anon, authenticated;
