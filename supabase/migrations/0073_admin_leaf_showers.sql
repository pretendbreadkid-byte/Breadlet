-- Fall Fiesta: the owner can start a leaf shower from the Admin Panel. Run after 0071.

begin;

alter table public.admin_events drop constraint if exists admin_events_kind_check;
alter table public.admin_events add constraint admin_events_kind_check
  check (kind in ('disco', 'barrel_roll', 'announcement', 'bread_rain', 'leaf_shower'));

-- Catch one leaf: while the hourly shower or an admin shower is falling, up to p_limit per shower.
-- An admin shower counts as its own shower, so it has its own limit.
create or replace function public.catch_fall_leaf(p_profile_id uuid, p_minutes integer, p_limit integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  player public.profiles%rowtype;
  shower timestamptz := date_trunc('hour', now(), 'UTC');
  admin_shower timestamptz;
  caught_now integer;
  wallet public.fall_fiesta_wallets%rowtype;
begin
  select * into player from public.profiles where id = p_profile_id;
  if not found then raise exception 'Player not found.'; end if;
  if player.is_banned or player.account_status <> 'active' then
    raise exception 'This account cannot play.';
  end if;

  select created_at into admin_shower from public.admin_events
  where kind = 'leaf_shower' and ends_at > now()
  order by created_at desc limit 1;

  if admin_shower is not null then
    shower := admin_shower;
  elsif now() >= shower + make_interval(mins => p_minutes) then
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

revoke all on function public.catch_fall_leaf(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.catch_fall_leaf(uuid, integer, integer) to service_role;

commit;
