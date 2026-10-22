-- Bazaar sales fee: sellers receive 90% of the price and the other 10% is destroyed,
-- so trading between players removes Bread Bucks instead of only moving them around.
-- Same function as 0036 except for the fee.

create or replace function public.secure_marketplace_action(
  p_profile_id uuid,
  p_action text,
  p_blook_name text default '',
  p_price integer default 0,
  p_listing_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  player public.profiles%rowtype;
  listing public.marketplace_listings%rowtype;
  blook_id_value uuid;
  is_shiny boolean;
  owned integer;
  amount integer;
  fee integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Server marketplace access is required.';
  end if;

  if p_action = 'create' then
    select * into player
    from public.profiles
    where id = p_profile_id
    for update;

    if not found or player.is_banned or player.account_status <> 'active' then
      raise exception 'Account unavailable.';
    end if;
    if p_price < 1 then
      raise exception 'Price must be between 1 and 2,147,483,647.';
    end if;

    is_shiny := left(p_blook_name, 6) = 'Shiny ';
    select id into blook_id_value
    from public.blooks
    where name = regexp_replace(p_blook_name, '^Shiny ', '');
    if blook_id_value is null then
      raise exception 'Unknown Breadlet.';
    end if;

    select quantity into owned
    from public.inventory
    where profile_id = p_profile_id
      and blook_id = blook_id_value
      and shiny = is_shiny
    for update;
    if coalesce(owned, 0) < 1 then
      raise exception 'You do not own that Breadlet.';
    end if;

    update public.inventory
    set quantity = quantity - 1
    where profile_id = p_profile_id
      and blook_id = blook_id_value
      and shiny = is_shiny;

    delete from public.inventory
    where profile_id = p_profile_id
      and blook_id = blook_id_value
      and shiny = is_shiny
      and quantity = 0;

    insert into public.marketplace_listings(profile_id, blook_id, quantity, price, status, shiny, escrowed)
    values (p_profile_id, blook_id_value, 1, p_price, 'active', is_shiny, true)
    returning * into listing;

    update public.profiles
    set stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object(
          'gameplayRevision',
          coalesce((stats->>'gameplayRevision')::integer, 0) + 1
        ),
        equipped_blook_id = case
          when player.equipped_blook_id = blook_id_value and owned = 1 then null
          else equipped_blook_id
        end
    where id = p_profile_id;

    return jsonb_build_object('ok', true, 'listing', to_jsonb(listing));
  elsif p_action = 'buy' then
    select * into listing
    from public.marketplace_listings
    where id = p_listing_id
    for update;
    if not found or listing.status <> 'active' then
      raise exception 'Listing is no longer active.';
    end if;
    if listing.profile_id = p_profile_id then
      raise exception 'You cannot buy your own listing.';
    end if;

    perform id
    from public.profiles
    where id in (p_profile_id, listing.profile_id)
    order by id
    for update;

    select * into player
    from public.profiles
    where id = p_profile_id;
    if not found or player.is_banned or player.account_status <> 'active' then
      raise exception 'Account unavailable.';
    end if;
    if player.tokens < listing.price then
      raise exception 'Insufficient tokens.';
    end if;

    if not listing.escrowed then
      select quantity into owned
      from public.inventory
      where profile_id = listing.profile_id
        and blook_id = listing.blook_id
        and shiny = listing.shiny
      for update;
      if coalesce(owned, 0) < 1 then
        raise exception 'The seller no longer owns this Breadlet.';
      end if;

      update public.inventory
      set quantity = quantity - 1
      where profile_id = listing.profile_id
        and blook_id = listing.blook_id
        and shiny = listing.shiny;

      delete from public.inventory
      where profile_id = listing.profile_id
        and blook_id = listing.blook_id
        and shiny = listing.shiny
        and quantity = 0;
    end if;

    amount := listing.price;
    -- 10% Bazaar fee: the buyer pays the full price, the seller gets the rest, and the
    -- fee is destroyed so every sale takes Bread Bucks out of circulation.
    fee := floor(amount * 0.10)::integer;
    update public.profiles
    set tokens = tokens + case when id = p_profile_id then -amount else amount - fee end,
        stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object(
          'gameplayRevision',
          coalesce((stats->>'gameplayRevision')::integer, 0) + 1
        )
    where id in (p_profile_id, listing.profile_id);

    insert into public.inventory(profile_id, blook_id, quantity, shiny)
    values (p_profile_id, listing.blook_id, 1, listing.shiny)
    on conflict(profile_id, blook_id, shiny)
    do update set quantity = public.inventory.quantity + 1;

    update public.marketplace_listings
    set status = 'sold',
        sold_at = now()
    where id = listing.id;

    return jsonb_build_object('ok', true, 'fee', fee);
  end if;

  raise exception 'Unknown marketplace action.';
end;
$$;

revoke all on function public.secure_marketplace_action(uuid, text, text, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.secure_marketplace_action(uuid, text, text, integer, uuid)
  to service_role;
