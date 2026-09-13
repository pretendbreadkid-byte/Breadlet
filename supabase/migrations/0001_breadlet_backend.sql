create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (char_length(username) between 3 and 20),
  email text unique,
  created_at timestamptz not null default now(),
  last_login_at timestamptz,
  tokens integer not null default 5000 check (tokens >= 0),
  luck integer not null default 0 check (luck >= 0),
  equipped_blook_id uuid,
  daily_reward_streak integer not null default 0 check (daily_reward_streak >= 0),
  last_daily_reward_at timestamptz,
  stats jsonb not null default '{}'::jsonb,
  materials jsonb not null default '{}'::jsonb,
  friends jsonb not null default '[]'::jsonb,
  account_status text not null default 'active' check (account_status in ('active', 'banned', 'restricted')),
  is_banned boolean not null default false,
  ban_reason text,
  ban_expires_at timestamptz
);

create table if not exists public.blooks (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  rarity text not null check (rarity in ('Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Chroma', 'Unique', 'Transcendent')),
  retired boolean not null default false,
  shiny_eligible boolean not null default false,
  artwork_key text,
  description text,
  custom_animation_key text,
  created_at timestamptz not null default now()
);

alter table public.profiles drop column if exists password_hash;
alter table public.profiles add column if not exists materials jsonb not null default '{}'::jsonb;
alter table public.profiles add column if not exists friends jsonb not null default '[]'::jsonb;

alter table public.profiles add constraint profiles_equipped_blook_fk foreign key (equipped_blook_id) references public.blooks(id) on delete set null;

create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  blook_id uuid not null references public.blooks(id) on delete restrict,
  quantity integer not null default 0 check (quantity >= 0),
  shiny boolean not null default false,
  retired boolean not null default false,
  created_at timestamptz not null default now(),
  unique (profile_id, blook_id, shiny)
);

create table if not exists public.chests (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  price integer not null check (price >= 0),
  description text,
  pool jsonb not null default '[]'::jsonb,
  rarity text,
  is_limited boolean not null default false,
  limited_until timestamptz,
  is_retired boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.chest_rolls (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  chest_id uuid not null references public.chests(id) on delete restrict,
  roll_seed text,
  reward_blook_id uuid references public.blooks(id) on delete set null,
  reward_rarity text,
  tokens_spent integer not null check (tokens_spent >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.token_transactions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  delta integer not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.mine_progress (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  current_earnings_today integer not null default 0 check (current_earnings_today >= 0),
  remaining_daily_limit integer not null default 500 check (remaining_daily_limit >= 0),
  pickaxe_level integer not null default 0 check (pickaxe_level between 0 and 5),
  total_tokens_mined integer not null default 0 check (total_tokens_mined >= 0),
  last_mine_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_rewards (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  reward_amount integer not null check (reward_amount >= 0),
  streak_count integer not null default 0 check (streak_count >= 0),
  claimed_at timestamptz not null default now(),
  unique (profile_id, claimed_at)
);

create table if not exists public.spins (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  reward_type text not null,
  reward_value integer not null default 0,
  rolled_at timestamptz not null default now(),
  unique (profile_id, rolled_at)
);

create table if not exists public.friends (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  friend_profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  check (profile_id <> friend_profile_id),
  unique (profile_id, friend_profile_id)
);

create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  sender_profile_id uuid not null references public.profiles(id) on delete cascade,
  receiver_profile_id uuid not null references public.profiles(id) on delete cascade,
  sender_offer_json jsonb not null default '{}'::jsonb,
  receiver_offer_json jsonb not null default '{}'::jsonb,
  sender_confirmed boolean not null default false,
  receiver_confirmed boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sender_profile_id <> receiver_profile_id)
);

create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  blook_id uuid not null references public.blooks(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  price integer not null check (price >= 0 and price <= 100000),
  status text not null default 'active' check (status in ('active', 'sold', 'cancelled', 'expired')),
  created_at timestamptz not null default now(),
  sold_at timestamptz
);

create table if not exists public.clans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  tags text[] not null default '{}',
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  treasury integer not null default 0 check (treasury >= 0),
  member_count integer not null default 1 check (member_count between 1 and 25),
  created_at timestamptz not null default now()
);

create table if not exists public.clan_members (
  id uuid primary key default gen_random_uuid(),
  clan_id uuid not null references public.clans(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('leader', 'admin', 'member')),
  token_contributions integer not null default 0 check (token_contributions >= 0),
  joined_at timestamptz not null default now(),
  unique (clan_id, profile_id)
);

create table if not exists public.global_chat_messages (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 500),
  reply_to_message_id uuid references public.global_chat_messages(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.clan_chat_messages (
  id uuid primary key default gen_random_uuid(),
  clan_id uuid not null references public.clans(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 500),
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  start_at timestamptz not null,
  end_at timestamptz not null check (end_at > start_at),
  active boolean not null default true,
  points_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.event_progress (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  points integer not null default 0 check (points >= 0),
  quests jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  unique (profile_id, event_id)
);

create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  reward_type text not null check (reward_type in ('tokens', 'blook', 'luck')),
  reward_value integer not null default 0,
  active boolean not null default true,
  expires_at timestamptz,
  max_uses integer,
  per_player_limit integer not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.promo_code_usage (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  promo_code_id uuid not null references public.promo_codes(id) on delete cascade,
  used_at timestamptz not null default now(),
  unique (profile_id, promo_code_id)
);

create table if not exists public.gifts (
  id uuid primary key default gen_random_uuid(),
  sender_profile_id uuid references public.profiles(id) on delete set null,
  receiver_profile_id uuid not null references public.profiles(id) on delete cascade,
  item_type text not null check (item_type in ('tokens', 'blook')),
  item_id uuid,
  quantity integer not null default 1 check (quantity > 0),
  message text,
  created_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  image_url text,
  start_at timestamptz not null,
  expires_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.bans (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  is_permanent boolean not null default false,
  started_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by_admin_id uuid references public.profiles(id) on delete set null
);

create table if not exists public.appeals (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  admin_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.admin_roles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'moderator')),
  created_at timestamptz not null default now(),
  unique (profile_id, role)
);

create index if not exists profiles_username_idx on public.profiles (lower(username));
create index if not exists inventory_profile_idx on public.inventory (profile_id);
create index if not exists token_transactions_profile_created_idx on public.token_transactions (profile_id, created_at desc);
create index if not exists chat_created_idx on public.global_chat_messages (created_at);
create index if not exists listings_status_created_idx on public.marketplace_listings (status, created_at desc);
create index if not exists friends_participants_idx on public.friends (friend_profile_id, status);
create index if not exists clan_members_profile_idx on public.clan_members (profile_id);
create index if not exists notifications_profile_read_idx on public.notifications (profile_id, is_read, created_at desc);
create index if not exists event_progress_event_idx on public.event_progress (event_id, points desc);
create index if not exists bans_profile_idx on public.bans (profile_id, expires_at);

insert into public.blooks (name, rarity, artwork_key)
values ('Bread Blook', 'Common', 'breadblook.jpg')
on conflict (name) do nothing;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, email)
  values (new.id, left(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1), 'BreadletPlayer'), 20), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.bootstrap_player_state()
returns trigger language plpgsql security definer set search_path = public
as $$
declare starter_id uuid;
begin
  select id into starter_id from public.blooks where name = 'Bread Blook';
  insert into public.inventory (profile_id, blook_id, quantity) values (new.id, starter_id, 1) on conflict do nothing;
  insert into public.mine_progress (profile_id) values (new.id) on conflict (profile_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_profile_created_bootstrap on public.profiles;
create trigger on_profile_created_bootstrap after insert on public.profiles for each row execute function public.bootstrap_player_state();

alter table public.profiles enable row level security;
alter table public.blooks enable row level security;
alter table public.inventory enable row level security;
alter table public.chests enable row level security;
alter table public.chest_rolls enable row level security;
alter table public.mine_progress enable row level security;
alter table public.token_transactions enable row level security;
alter table public.daily_rewards enable row level security;
alter table public.spins enable row level security;
alter table public.friends enable row level security;
alter table public.trades enable row level security;
alter table public.marketplace_listings enable row level security;
alter table public.clans enable row level security;
alter table public.clan_members enable row level security;
alter table public.global_chat_messages enable row level security;
alter table public.clan_chat_messages enable row level security;
alter table public.notifications enable row level security;
alter table public.events enable row level security;
alter table public.event_progress enable row level security;
alter table public.promo_codes enable row level security;
alter table public.promo_code_usage enable row level security;
alter table public.gifts enable row level security;
alter table public.announcements enable row level security;
alter table public.bans enable row level security;
alter table public.appeals enable row level security;
alter table public.admin_roles enable row level security;

create policy profiles_select_authenticated on public.profiles for select to authenticated using (true);
create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy blooks_select_authenticated on public.blooks for select to authenticated using (true);
create policy chests_select_authenticated on public.chests for select to authenticated using (active = true);
create policy inventory_owner on public.inventory for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy chest_rolls_owner on public.chest_rolls for select to authenticated using (profile_id = auth.uid());
create policy mine_owner on public.mine_progress for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy transactions_owner_read on public.token_transactions for select to authenticated using (profile_id = auth.uid());
create policy daily_rewards_owner on public.daily_rewards for select to authenticated using (profile_id = auth.uid());
create policy spins_owner on public.spins for select to authenticated using (profile_id = auth.uid());
create policy friends_participant on public.friends for all to authenticated using (profile_id = auth.uid() or friend_profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy trades_participant on public.trades for all to authenticated using (sender_profile_id = auth.uid() or receiver_profile_id = auth.uid()) with check (sender_profile_id = auth.uid() or receiver_profile_id = auth.uid());
create policy listings_read_authenticated on public.marketplace_listings for select to authenticated using (true);
create policy listings_owner_write on public.marketplace_listings for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy clans_read_authenticated on public.clans for select to authenticated using (true);
create policy clan_members_read_authenticated on public.clan_members for select to authenticated using (true);
create policy chat_read_authenticated on public.global_chat_messages for select to authenticated using (deleted_at is null);
create policy chat_insert_self on public.global_chat_messages for insert to authenticated with check (profile_id = auth.uid());
create policy clan_chat_member_read on public.clan_chat_messages for select to authenticated using (exists (select 1 from public.clan_members m where m.clan_id = clan_chat_messages.clan_id and m.profile_id = auth.uid()));
create policy notifications_owner on public.notifications for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy events_read_authenticated on public.events for select to authenticated using (active = true);
create policy event_progress_owner on public.event_progress for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy promo_codes_read_authenticated on public.promo_codes for select to authenticated using (active = true);
create policy promo_usage_owner on public.promo_code_usage for select to authenticated using (profile_id = auth.uid());
create policy gifts_participant on public.gifts for select to authenticated using (sender_profile_id = auth.uid() or receiver_profile_id = auth.uid());
create policy announcements_read_authenticated on public.announcements for select to authenticated using (active = true);
create policy appeals_owner on public.appeals for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy bans_owner_read on public.bans for select to authenticated using (profile_id = auth.uid());
create policy admin_roles_owner_read on public.admin_roles for select to authenticated using (profile_id = auth.uid());

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'global_chat_messages') then
    alter publication supabase_realtime add table public.global_chat_messages;
  end if;
exception when undefined_object then
  null;
end;
$$;
