begin;

insert into public.blooks (name, rarity, artwork_key) values
  ('Wheel', 'Common', 'wheel.svg'),
  ('Letter', 'Uncommon', 'letter.svg'),
  ('Gears', 'Rare', 'gears.svg'),
  ('Da Vinci''s Ornithopter', 'Epic', 'DaVinci''sOrnothopter (1).svg'),
  ('Leonardo da Vinci', 'Legendary', 'leonardo da vici.svg'),
  ('Bitcoin', 'Mythic', 'bitcoin.svg'),
  ('Space Trooper', 'Rare', 'Lost and found + food pack/space troopeer.png')
on conflict (name) do update set rarity = excluded.rarity, artwork_key = excluded.artwork_key;

create or replace function public.apply_gameplay_action(
  p_profile_id uuid,
  p_revision integer,
  p_action text,
  p_token_delta integer,
  p_inventory_delta jsonb,
  p_material_delta jsonb,
  p_candy_delta integer,
  p_capsules_opened integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  player public.profiles%rowtype;
  next_stats jsonb;
  next_materials jsonb;
  item jsonb;
  item_id uuid;
  item_shiny boolean;
  item_delta integer;
  owned integer;
  material record;
  balance integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Server gameplay access is required.'; end if;
  if p_action not in ('open', 'crate', 'craft', 'dismantle', 'sell')
    or p_candy_delta < 0 or p_candy_delta > 500
    or p_capsules_opened < 0 or p_capsules_opened > 500
    or jsonb_typeof(p_inventory_delta) <> 'array'
    or jsonb_typeof(p_material_delta) <> 'object' then
    raise exception 'Invalid gameplay transaction.';
  end if;
  select * into player from public.profiles where id = p_profile_id for update;
  if not found then raise exception 'Player not found.'; end if;
  if player.is_banned or player.account_status <> 'active' then raise exception 'This account cannot play.'; end if;
  next_stats := coalesce(player.stats, '{}'::jsonb);
  if coalesce((next_stats->>'gameplayRevision')::integer, 0) <> p_revision then
    raise exception 'Your game state changed. Refresh and retry.';
  end if;
  if next_stats->>'lastGameplayAt' is not null and (next_stats->>'lastGameplayAt')::timestamptz > now() - interval '500 milliseconds' then
    raise exception 'Please wait a moment before your next action.';
  end if;
  if p_action = 'crate' then
    if next_stats->>'wheelSpunAt' is not null and ((next_stats->>'wheelSpunAt')::timestamptz at time zone 'UTC')::date = (now() at time zone 'UTC')::date then
      raise exception 'You already opened today''s Daily Crate.';
    end if;
    next_stats := next_stats || jsonb_build_object('wheelSpun', true, 'wheelSpunAt', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
  end if;
  if player.tokens::bigint + p_token_delta < 0 or player.tokens::bigint + p_token_delta > 2147483647 then
    raise exception 'Invalid token balance.';
  end if;
  next_materials := coalesce(player.materials, '{}'::jsonb);
  for material in select key, value from jsonb_each_text(p_material_delta) loop
    if material.key not in ('Gold', 'Cloth', 'Gem', 'Sugar', 'Flower', 'Metal') then raise exception 'Invalid material.'; end if;
    balance := coalesce((next_materials->>material.key)::integer, 0) + material.value::integer;
    if balance < 0 then raise exception 'Insufficient materials.'; end if;
    next_materials := jsonb_set(next_materials, array[material.key], to_jsonb(balance));
  end loop;
  for item in select value from jsonb_array_elements(p_inventory_delta) loop
    item_id := (item->>'blook_id')::uuid;
    item_shiny := coalesce((item->>'shiny')::boolean, false);
    item_delta := (item->>'quantity')::integer;
    if not exists (select 1 from public.blooks where id = item_id) then raise exception 'Unknown Breadlet.'; end if;
    select quantity into owned from public.inventory
      where profile_id = p_profile_id and blook_id = item_id and shiny = item_shiny for update;
    if coalesce(owned, 0) + item_delta < 0 then raise exception 'Your collection changed. Refresh and retry.'; end if;
    if p_action = 'sell' and coalesce(owned, 0) + item_delta < 1 then raise exception 'Keep one copy of every Breadlet.'; end if;
    if item_delta > 0 then
      insert into public.inventory (profile_id, blook_id, quantity, shiny)
        values (p_profile_id, item_id, item_delta, item_shiny)
        on conflict (profile_id, blook_id, shiny) do update set quantity = public.inventory.quantity + excluded.quantity;
    elsif item_delta < 0 then
      update public.inventory set quantity = quantity + item_delta
        where profile_id = p_profile_id and blook_id = item_id and shiny = item_shiny;
      delete from public.inventory where profile_id = p_profile_id and blook_id = item_id and shiny = item_shiny and quantity = 0;
    end if;
  end loop;
  next_stats := next_stats || jsonb_build_object(
    'gameplayRevision', p_revision + 1,
    'lastGameplayAt', now(),
    'candy', coalesce((next_stats->>'candy')::integer, 0) + p_candy_delta,
    'capsulesOpened', coalesce((next_stats->>'capsulesOpened')::integer, 0) + p_capsules_opened
  );
  update public.profiles set tokens = tokens + p_token_delta, materials = next_materials, stats = next_stats,
    equipped_blook_id = case when exists (
      select 1 from public.inventory where profile_id = p_profile_id and blook_id = player.equipped_blook_id and quantity > 0
    ) then player.equipped_blook_id else null end
    where id = p_profile_id;
end;
$$;

revoke all on function public.apply_gameplay_action(uuid, integer, text, integer, jsonb, jsonb, integer, integer) from public, anon, authenticated;
grant execute on function public.apply_gameplay_action(uuid, integer, text, integer, jsonb, jsonb, integer, integer) to service_role;

alter table public.marketplace_listings add column if not exists shiny boolean not null default false;
alter table public.marketplace_listings add column if not exists escrowed boolean not null default false;

create or replace function public.secure_marketplace_action(p_profile_id uuid, p_action text, p_blook_name text default '', p_price integer default 0, p_listing_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  player public.profiles%rowtype;
  listing public.marketplace_listings%rowtype;
  blook_id_value uuid;
  is_shiny boolean;
  owned integer;
  amount integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Server marketplace access is required.'; end if;
  if p_action = 'create' then
    select * into player from public.profiles where id = p_profile_id for update;
    if not found or player.is_banned or player.account_status <> 'active' then raise exception 'Account unavailable.'; end if;
    if p_price < 1 or p_price > 100000 then raise exception 'Price must be between 1 and 100,000.'; end if;
    is_shiny := left(p_blook_name, 6) = 'Shiny ';
    select id into blook_id_value from public.blooks where name = regexp_replace(p_blook_name, '^Shiny ', '');
    if blook_id_value is null then raise exception 'Unknown Breadlet.'; end if;
    select quantity into owned from public.inventory where profile_id = p_profile_id and blook_id = blook_id_value and shiny = is_shiny for update;
    if coalesce(owned, 0) < 1 then raise exception 'You do not own that Breadlet.'; end if;
    update public.inventory set quantity = quantity - 1 where profile_id = p_profile_id and blook_id = blook_id_value and shiny = is_shiny;
    delete from public.inventory where profile_id = p_profile_id and blook_id = blook_id_value and shiny = is_shiny and quantity = 0;
    insert into public.marketplace_listings(profile_id, blook_id, quantity, price, status, shiny, escrowed)
      values (p_profile_id, blook_id_value, 1, p_price, 'active', is_shiny, true) returning * into listing;
    update public.profiles set stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object('gameplayRevision', coalesce((stats->>'gameplayRevision')::integer, 0) + 1),
      equipped_blook_id = case when player.equipped_blook_id = blook_id_value and owned = 1 then null else equipped_blook_id end where id = p_profile_id;
    return jsonb_build_object('ok', true, 'listing', to_jsonb(listing));
  elsif p_action = 'buy' then
    select * into listing from public.marketplace_listings where id = p_listing_id for update;
    if not found or listing.status <> 'active' then raise exception 'Listing is no longer active.'; end if;
    if listing.profile_id = p_profile_id then raise exception 'You cannot buy your own listing.'; end if;
    perform id from public.profiles where id in (p_profile_id, listing.profile_id) order by id for update;
    select * into player from public.profiles where id = p_profile_id;
    if not found or player.is_banned or player.account_status <> 'active' then raise exception 'Account unavailable.'; end if;
    if player.tokens < listing.price then raise exception 'Insufficient tokens.'; end if;
    if not listing.escrowed then
      select quantity into owned from public.inventory where profile_id = listing.profile_id and blook_id = listing.blook_id and shiny = listing.shiny for update;
      if coalesce(owned, 0) < 1 then raise exception 'The seller no longer owns this Breadlet.'; end if;
      update public.inventory set quantity = quantity - 1 where profile_id = listing.profile_id and blook_id = listing.blook_id and shiny = listing.shiny;
      delete from public.inventory where profile_id = listing.profile_id and blook_id = listing.blook_id and shiny = listing.shiny and quantity = 0;
    end if;
    amount := listing.price;
    update public.profiles set tokens = tokens + case when id = p_profile_id then -amount else amount end,
      stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object('gameplayRevision', coalesce((stats->>'gameplayRevision')::integer, 0) + 1)
      where id in (p_profile_id, listing.profile_id);
    insert into public.inventory(profile_id, blook_id, quantity, shiny) values (p_profile_id, listing.blook_id, 1, listing.shiny)
      on conflict(profile_id, blook_id, shiny) do update set quantity = public.inventory.quantity + 1;
    update public.marketplace_listings set status = 'sold', sold_at = now() where id = listing.id;
    return jsonb_build_object('ok', true);
  end if;
  raise exception 'Unknown marketplace action.';
end;
$$;
revoke all on function public.secure_marketplace_action(uuid, text, text, integer, uuid) from public, anon, authenticated;
grant execute on function public.secure_marketplace_action(uuid, text, text, integer, uuid) to service_role;

create or replace function public.secure_clan_donation(p_profile_id uuid, p_clan_id uuid, p_amount integer)
returns integer language plpgsql security definer set search_path = public as $$
declare balance integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Server clan access is required.'; end if;
  if p_amount < 1 or p_amount > 1000000 then raise exception 'Invalid donation amount.'; end if;
  select tokens into balance from public.profiles where id = p_profile_id and not is_banned and account_status = 'active' for update;
  if not found or balance < p_amount then raise exception 'Insufficient tokens.'; end if;
  perform id from public.clan_members where profile_id = p_profile_id and clan_id = p_clan_id for update;
  if not found then raise exception 'Join this clan before donating.'; end if;
  update public.profiles set tokens = tokens - p_amount,
    stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object('gameplayRevision', coalesce((stats->>'gameplayRevision')::integer, 0) + 1) where id = p_profile_id;
  update public.clan_members set token_contributions = token_contributions + p_amount where profile_id = p_profile_id and clan_id = p_clan_id;
  update public.clans set treasury = treasury + p_amount where id = p_clan_id returning treasury into balance;
  return balance;
end;
$$;
revoke all on function public.secure_clan_donation(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.secure_clan_donation(uuid, uuid, integer) to service_role;

create or replace function public.secure_builtin_promo(p_profile_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare player public.profiles%rowtype; redeemed boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Server promo access is required.'; end if;
  select * into player from public.profiles where id = p_profile_id for update;
  if not found or player.is_banned or player.account_status <> 'active' then raise exception 'Account unavailable.'; end if;
  if to_regclass('public.promo_redemptions') is not null then
    execute 'select exists(select 1 from public.promo_redemptions where profile_id = $1 and promo_code = $2)' into redeemed using p_profile_id, 'Breadlet2.0';
  end if;
  if redeemed or coalesce((player.stats->>'builtInPromoRedeemed')::boolean, false) then raise exception 'You already redeemed this promo code.'; end if;
  update public.profiles set tokens = tokens + 1000,
    stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object('builtInPromoRedeemed', true, 'gameplayRevision', coalesce((stats->>'gameplayRevision')::integer, 0) + 1)
    where id = p_profile_id;
end;
$$;
revoke all on function public.secure_builtin_promo(uuid) from public, anon, authenticated;
grant execute on function public.secure_builtin_promo(uuid) to service_role;

create table if not exists public.trade_candy_awards(trade_id uuid primary key references public.trades(id) on delete cascade);
alter table public.trade_candy_awards enable row level security;
revoke all on public.trade_candy_awards from anon, authenticated;
create or replace function public.award_trade_candy(p_trade_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare trade public.trades%rowtype; inserted integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Server event access is required.'; end if;
  if now() < timestamptz '2026-10-02 00:00:00+00' or now() >= timestamptz '2026-10-24 00:00:00+00' then return; end if;
  select * into trade from public.trades where id = p_trade_id and status = 'completed';
  if not found then raise exception 'Trade is not completed.'; end if;
  insert into public.trade_candy_awards(trade_id) values(p_trade_id) on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then return; end if;
  perform id from public.profiles where id in (trade.sender_profile_id, trade.receiver_profile_id) order by id for update;
  update public.profiles set stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object(
    'candy', coalesce((stats->>'candy')::integer, 0) + 1,
    'gameplayRevision', coalesce((stats->>'gameplayRevision')::integer, 0) + 1
  ) where id in (trade.sender_profile_id, trade.receiver_profile_id);
end;
$$;
revoke all on function public.award_trade_candy(uuid) from public, anon, authenticated;
grant execute on function public.award_trade_candy(uuid) to service_role;

revoke insert, update, delete on public.profiles from anon, authenticated;
revoke insert, update, delete on public.inventory from anon, authenticated;
revoke insert, update, delete on public.mine_progress from anon, authenticated;
revoke insert, update, delete on public.marketplace_listings from anon, authenticated;
revoke all on function public.save_player_inventory(jsonb) from public, anon, authenticated;

commit;