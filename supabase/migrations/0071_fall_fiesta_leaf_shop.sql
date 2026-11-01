-- Fall Fiesta: a leaf shower at the top of every hour. Players catch leaves and spend them in
-- the leaf shop. Everything goes through the server (service role), so leaves can't be faked.

begin;

-- Bought once each with leaves. Unique, so they can't be sold or traded.
insert into public.blooks (name, rarity, artwork_key) values
  ('Acorn', 'Unique', 'fall/acorn.svg'),
  ('Pilgrim Hat', 'Unique', 'fall/pilgrim-hat.webp'),
  ('Fall Leaf', 'Unique', 'fall/fall-leaf.webp')
on conflict (name) do update set rarity = excluded.rarity, artwork_key = excluded.artwork_key;

create table if not exists public.fall_fiesta_wallets (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  leaves integer not null default 0 check (leaves >= 0),
  caught integer not null default 0,
  bought text[] not null default '{}'
);

-- How many leaves each player caught in each hourly shower (the catch is capped per shower).
create table if not exists public.fall_fiesta_showers (
  shower_at timestamptz not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  catches integer not null default 0,
  primary key (shower_at, profile_id)
);

alter table public.fall_fiesta_wallets enable row level security;
alter table public.fall_fiesta_showers enable row level security;
revoke all on public.fall_fiesta_wallets from anon, authenticated;
revoke all on public.fall_fiesta_showers from anon, authenticated;

-- Catch one leaf: only while this hour's shower is falling, and up to p_limit per shower.
create or replace function public.catch_fall_leaf(p_profile_id uuid, p_minutes integer, p_limit integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  player public.profiles%rowtype;
  shower timestamptz := date_trunc('hour', now(), 'UTC');
  caught_now integer;
  wallet public.fall_fiesta_wallets%rowtype;
begin
  select * into player from public.profiles where id = p_profile_id;
  if not found then raise exception 'Player not found.'; end if;
  if player.is_banned or player.account_status <> 'active' then
    raise exception 'This account cannot play.';
  end if;
  if now() >= shower + make_interval(mins => p_minutes) then
    raise exception 'The leaf shower is over.';
  end if;

  insert into public.fall_fiesta_showers (shower_at, profile_id, catches)
  values (shower, p_profile_id, 1)
  on conflict (shower_at, profile_id) do update
    set catches = fall_fiesta_showers.catches + 1
    where fall_fiesta_showers.catches < p_limit
  returning catches into caught_now;

  if caught_now is null then
    raise exception 'You caught every leaf in this shower.';
  end if;

  insert into public.fall_fiesta_wallets (profile_id, leaves, caught)
  values (p_profile_id, 1, 1)
  on conflict (profile_id) do update
    set leaves = fall_fiesta_wallets.leaves + 1, caught = fall_fiesta_wallets.caught + 1
  returning * into wallet;

  return jsonb_build_object('leaves', wallet.leaves, 'caught', caught_now, 'bought', to_jsonb(wallet.bought));
end;
$$;

-- Buy one shop item with leaves, once per player: a Breadlet, or a badge when p_badge is true.
create or replace function public.buy_fall_reward(p_profile_id uuid, p_item text, p_price integer, p_badge boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  player public.profiles%rowtype;
  wallet public.fall_fiesta_wallets%rowtype;
  reward_id uuid;
  badges jsonb;
begin
  select * into player from public.profiles where id = p_profile_id;
  if not found then raise exception 'Player not found.'; end if;
  if player.is_banned or player.account_status <> 'active' then
    raise exception 'This account cannot play.';
  end if;

  select * into wallet from public.fall_fiesta_wallets where profile_id = p_profile_id for update;
  if not found or wallet.leaves < p_price then raise exception 'You need more leaves.'; end if;
  if p_item = any(wallet.bought) then raise exception 'You already own that.'; end if;

  update public.fall_fiesta_wallets
  set leaves = leaves - p_price, bought = array_append(bought, p_item)
  where profile_id = p_profile_id
  returning * into wallet;

  if p_badge then
    update public.profiles
    set stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object(
      'badges', case when coalesce(stats->'badges', '[]'::jsonb) ? p_item
        then stats->'badges' else coalesce(stats->'badges', '[]'::jsonb) || to_jsonb(p_item) end)
    where id = p_profile_id;
  else
    select id into reward_id from public.blooks where name = p_item;
    if reward_id is null then raise exception '% is missing from the Breadlet catalog.', p_item; end if;
    insert into public.inventory (profile_id, blook_id, quantity, shiny)
    values (p_profile_id, reward_id, 1, false)
    on conflict (profile_id, blook_id, shiny) do update
    set quantity = public.inventory.quantity + 1;
  end if;

  update public.profiles
  set stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object('gameplayRevision', coalesce((stats->>'gameplayRevision')::integer, 0) + 1)
  where id = p_profile_id;

  return jsonb_build_object('leaves', wallet.leaves, 'bought', to_jsonb(wallet.bought));
end;
$$;

revoke all on function public.catch_fall_leaf(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.buy_fall_reward(uuid, text, integer, boolean) from public, anon, authenticated;
grant execute on function public.catch_fall_leaf(uuid, integer, integer) to service_role;
grant execute on function public.buy_fall_reward(uuid, text, integer, boolean) to service_role;

commit;
