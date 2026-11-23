-- Bazaar auctions: put one Breadlet up for 1 to 48 hours with a starting bid; players bid Bread
-- Bucks. The Breadlet is held while the auction runs, and every bid is taken from the bidder right
-- away (the previous top bidder gets theirs back). When time runs out the winner gets the Breadlet
-- and the seller gets the top bid minus the usual 10% Bazaar fee; with no bids the Breadlet goes
-- back to the seller. A bid in the last minute adds a minute, so nobody wins by sniping.
-- Only the server (service role) can call these; app/api/marketplace/auctions does.

create table if not exists public.bazaar_auctions (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  blook_id uuid not null references public.blooks(id),
  shiny boolean not null default false,
  start_bid integer not null check (start_bid >= 1),
  top_bid integer,
  top_bidder_id uuid references public.profiles(id) on delete set null,
  bid_count integer not null default 0,
  ends_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'sold', 'unsold', 'cancelled')),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index if not exists bazaar_auctions_open_idx on public.bazaar_auctions (status, ends_at);
alter table public.bazaar_auctions enable row level security;
revoke all on public.bazaar_auctions from anon, authenticated;

-- Gives one Breadlet back (or to the winner).
create or replace function public.bazaar_auction_give(p_profile_id uuid, p_blook_id uuid, p_shiny boolean)
returns void
language sql
security definer
set search_path to 'public'
as $$
  insert into public.inventory (profile_id, blook_id, quantity, shiny)
  values (p_profile_id, p_blook_id, 1, p_shiny)
  on conflict (profile_id, blook_id, shiny) do update set quantity = public.inventory.quantity + 1;
$$;
revoke all on function public.bazaar_auction_give(uuid, uuid, boolean) from public, anon, authenticated;

-- Ends every auction whose time is up. Returns what happened, for notifications.
create or replace function public.settle_bazaar_auctions()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  auction public.bazaar_auctions%rowtype;
  fee integer;
  results jsonb := '[]'::jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Server access is required.'; end if;
  for auction in
    select * from public.bazaar_auctions where status = 'open' and ends_at <= now() order by ends_at limit 50 for update skip locked
  loop
    if auction.top_bidder_id is not null and auction.top_bid is not null then
      perform public.bazaar_auction_give(auction.top_bidder_id, auction.blook_id, auction.shiny);
      fee := floor(auction.top_bid * 0.10)::integer;
      update public.profiles set tokens = tokens + (auction.top_bid - fee) where id = auction.seller_id;
      update public.bazaar_auctions set status = 'sold', settled_at = now() where id = auction.id;
      results := results || jsonb_build_object('id', auction.id, 'status', 'sold', 'seller', auction.seller_id, 'winner', auction.top_bidder_id, 'blook', auction.blook_id, 'shiny', auction.shiny, 'price', auction.top_bid, 'fee', fee);
    else
      perform public.bazaar_auction_give(auction.seller_id, auction.blook_id, auction.shiny);
      update public.bazaar_auctions set status = 'unsold', settled_at = now() where id = auction.id;
      results := results || jsonb_build_object('id', auction.id, 'status', 'unsold', 'seller', auction.seller_id, 'blook', auction.blook_id, 'shiny', auction.shiny);
    end if;
    update public.profiles
    set stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object('gameplayRevision', coalesce((stats->>'gameplayRevision')::integer, 0) + 1)
    where id in (auction.seller_id, coalesce(auction.top_bidder_id, auction.seller_id));
  end loop;
  return results;
end;
$$;
revoke all on function public.settle_bazaar_auctions() from public, anon, authenticated;

-- 'create' (p_blook_name, p_amount = starting bid, p_hours) | 'bid' (p_auction_id, p_amount)
-- | 'cancel' (p_auction_id; only before anyone bids).
create or replace function public.bazaar_auction_action(p_profile_id uuid, p_action text, p_blook_name text default '', p_amount integer default 0, p_hours integer default 24, p_auction_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  player public.profiles%rowtype;
  auction public.bazaar_auctions%rowtype;
  blook_id_value uuid;
  is_shiny boolean;
  owned integer;
  min_bid integer;
  previous_bidder uuid;
  previous_bid integer;
  cost integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Server access is required.'; end if;
  select * into player from public.profiles where id = p_profile_id for update;
  if not found or player.is_banned or player.account_status <> 'active' then raise exception 'Account unavailable.'; end if;

  if p_action = 'create' then
    if p_amount < 1 then raise exception 'The starting bid must be at least 1 Bread Buck.'; end if;
    if p_hours < 1 or p_hours > 48 then raise exception 'Auctions last 1 to 48 hours.'; end if;
    if (select count(*) from public.bazaar_auctions where seller_id = p_profile_id and status = 'open') >= 5 then
      raise exception 'You can run up to 5 auctions at once.';
    end if;
    is_shiny := left(p_blook_name, 6) = 'Shiny ';
    select id into blook_id_value from public.blooks where name = regexp_replace(p_blook_name, '^Shiny ', '');
    if blook_id_value is null then raise exception 'Unknown Breadlet.'; end if;
    select quantity into owned from public.inventory where profile_id = p_profile_id and blook_id = blook_id_value and shiny = is_shiny for update;
    if coalesce(owned, 0) < 1 then raise exception 'You do not own that Breadlet.'; end if;
    update public.inventory set quantity = quantity - 1 where profile_id = p_profile_id and blook_id = blook_id_value and shiny = is_shiny;
    delete from public.inventory where profile_id = p_profile_id and blook_id = blook_id_value and shiny = is_shiny and quantity = 0;
    insert into public.bazaar_auctions (seller_id, blook_id, shiny, start_bid, ends_at)
    values (p_profile_id, blook_id_value, is_shiny, p_amount, now() + make_interval(hours => p_hours))
    returning * into auction;
    update public.profiles
    set stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object('gameplayRevision', coalesce((stats->>'gameplayRevision')::integer, 0) + 1),
        equipped_blook_id = case when equipped_blook_id = blook_id_value and owned = 1 then null else equipped_blook_id end
    where id = p_profile_id;
    return jsonb_build_object('ok', true, 'auction', to_jsonb(auction));

  elsif p_action = 'bid' then
    select * into auction from public.bazaar_auctions where id = p_auction_id for update;
    if not found or auction.status <> 'open' or auction.ends_at <= now() then raise exception 'This auction has ended.'; end if;
    if auction.seller_id = p_profile_id then raise exception 'You cannot bid on your own auction.'; end if;
    min_bid := case when auction.top_bid is null then auction.start_bid else auction.top_bid + greatest(1, ceil(auction.top_bid * 0.05)::integer) end;
    if p_amount < min_bid then raise exception 'Bid at least % Bread Bucks.', min_bid; end if;
    previous_bidder := auction.top_bidder_id;
    previous_bid := coalesce(auction.top_bid, 0);
    -- Raising your own top bid only costs the difference.
    cost := case when previous_bidder = p_profile_id then p_amount - previous_bid else p_amount end;
    if player.tokens < cost then raise exception 'You do not have enough Bread Bucks.'; end if;
    update public.profiles set tokens = tokens - cost where id = p_profile_id;
    if previous_bidder is not null and previous_bidder <> p_profile_id then
      update public.profiles set tokens = tokens + previous_bid where id = previous_bidder;
    end if;
    update public.bazaar_auctions
    set top_bid = p_amount, top_bidder_id = p_profile_id, bid_count = bid_count + 1,
        ends_at = greatest(ends_at, now() + interval '1 minute')
    where id = auction.id
    returning * into auction;
    return jsonb_build_object('ok', true, 'auction', to_jsonb(auction), 'outbid', case when previous_bidder is not null and previous_bidder <> p_profile_id then previous_bidder end, 'outbidAmount', previous_bid);

  elsif p_action = 'cancel' then
    select * into auction from public.bazaar_auctions where id = p_auction_id for update;
    if not found or auction.status <> 'open' then raise exception 'This auction has ended.'; end if;
    if auction.seller_id <> p_profile_id then raise exception 'Only the seller can take this auction down.'; end if;
    if auction.top_bidder_id is not null then raise exception 'Someone has already bid, so it has to run to the end.'; end if;
    perform public.bazaar_auction_give(p_profile_id, auction.blook_id, auction.shiny);
    update public.bazaar_auctions set status = 'cancelled', settled_at = now() where id = auction.id;
    return jsonb_build_object('ok', true);
  end if;
  raise exception 'Unknown auction action.';
end;
$$;
revoke all on function public.bazaar_auction_action(uuid, text, text, integer, integer, uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
