-- Tanuki drop: when 12+ players are online, 1 in 12 leaf showers has a Tanuki for one of them.
-- The roll happens once per shower here; the first eligible player to ask (browsers ask at a
-- random moment early in the shower) gets it, and clicking it gives them a Tanuki.
create table if not exists public.fall_tanuki_drops (
  shower_at timestamptz primary key,
  lucky boolean not null,
  profile_id uuid references public.profiles(id) on delete set null,
  caught_at timestamptz
);
alter table public.fall_tanuki_drops enable row level security;
revoke all on public.fall_tanuki_drops from anon, authenticated;

create or replace function public.pick_fall_tanuki(p_profile_id uuid, p_shower_at timestamptz)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into public.fall_tanuki_drops (shower_at, lucky) values (p_shower_at, random() < 1.0 / 12)
  on conflict (shower_at) do nothing;
  update public.fall_tanuki_drops set profile_id = p_profile_id
  where shower_at = p_shower_at and lucky and profile_id is null;
  return exists (select 1 from public.fall_tanuki_drops
    where shower_at = p_shower_at and lucky and profile_id = p_profile_id and caught_at is null);
end;
$$;

create or replace function public.catch_fall_tanuki(p_profile_id uuid, p_shower_at timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare player public.profiles%rowtype; reward_id uuid;
begin
  select * into player from public.profiles where id = p_profile_id for update;
  if not found or player.is_banned or player.account_status <> 'active' then raise exception 'This account cannot play.'; end if;
  update public.fall_tanuki_drops set caught_at = now()
  where shower_at = p_shower_at and profile_id = p_profile_id and caught_at is null;
  if not found then raise exception 'That Tanuki got away.'; end if;
  select id into reward_id from public.blooks where name = 'Tanuki';
  if reward_id is null then raise exception 'Tanuki is missing from the Breadlet catalog.'; end if;
  insert into public.inventory (profile_id, blook_id, quantity, shiny) values (p_profile_id, reward_id, 1, false)
  on conflict (profile_id, blook_id, shiny) do update set quantity = public.inventory.quantity + 1;
  update public.profiles set stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object('gameplayRevision', coalesce((stats->>'gameplayRevision')::integer, 0) + 1)
  where id = p_profile_id;
  return jsonb_build_object('blook', 'Tanuki');
end;
$$;
revoke all on function public.pick_fall_tanuki(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.catch_fall_tanuki(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.pick_fall_tanuki(uuid, timestamptz) to service_role;
grant execute on function public.catch_fall_tanuki(uuid, timestamptz) to service_role;

-- Igloo joins the Winter Bag as an Epic; new art for Alien (animated), Coffee Mug and Wheel.
insert into public.blooks (name, rarity, artwork_key) values ('Igloo', 'Epic', 'winter/igloo.svg')
on conflict (name) do update set rarity = excluded.rarity, artwork_key = excluded.artwork_key;
update public.blooks set artwork_key = 'alien-animated.svg' where name = 'Alien';
update public.blooks set artwork_key = 'coffee-mug-2.svg' where name = 'Coffee Mug';
update public.blooks set artwork_key = 'wheel-2.svg' where name = 'Wheel';
