create unique index if not exists profiles_username_ci_unique
  on public.profiles (lower(username));

create table if not exists public.signup_ip_limits (
  ip_hash text primary key,
  window_started_at timestamptz not null default now(),
  signup_count integer not null default 0 check (signup_count >= 0)
);

create or replace function public.allow_signup_attempt(p_ip_hash text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  attempts integer;
begin
  insert into public.signup_ip_limits (ip_hash, window_started_at, signup_count)
  values (p_ip_hash, now(), 1)
  on conflict (ip_hash) do update
    set window_started_at = case
          when signup_ip_limits.window_started_at < now() - interval '24 hours' then now()
          else signup_ip_limits.window_started_at
        end,
        signup_count = case
          when signup_ip_limits.window_started_at < now() - interval '24 hours' then 1
          else signup_ip_limits.signup_count + 1
        end
  returning signup_count into attempts;

  return attempts <= 3;
end;
$$;

revoke all on function public.allow_signup_attempt(text) from public, anon, authenticated;
grant execute on function public.allow_signup_attempt(text) to service_role;

drop policy if exists trades_participant on public.trades;
create policy trades_participant_read on public.trades
  for select to authenticated
  using (sender_profile_id = auth.uid() or receiver_profile_id = auth.uid());

create or replace function public.respond_to_trade(
  p_trade_id uuid,
  p_profile_id uuid,
  p_action text,
  p_offer jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  trade_row public.trades%rowtype;
  current_offer jsonb;
  offer_tokens integer;
  item jsonb;
  item_name text;
  item_quantity integer;
  item_shiny boolean;
  item_blook_id uuid;
  inventory_quantity integer;
  sender_tokens integer;
  receiver_tokens integer;
  sender_item jsonb;
  receiver_item jsonb;
  transfer_name text;
  transfer_quantity integer;
  transfer_shiny boolean;
  transfer_blook_id uuid;
  transfer_row public.inventory%rowtype;
  source_profile uuid;
  target_profile uuid;
begin
  select * into trade_row
  from public.trades
  where id = p_trade_id
  for update;

  if not found then raise exception 'Trade not found.'; end if;
  if p_profile_id not in (trade_row.sender_profile_id, trade_row.receiver_profile_id) then
    raise exception 'You are not part of this trade.';
  end if;

  if p_action = 'decline' or p_action = 'cancel' then
    if trade_row.status <> 'pending' then raise exception 'This trade is no longer pending.'; end if;
    if (p_action = 'cancel' and p_profile_id <> trade_row.sender_profile_id)
      or (p_action = 'decline' and p_profile_id <> trade_row.receiver_profile_id) then
      raise exception 'You cannot perform that action on this trade.';
    end if;
    update public.trades set status = case when p_action = 'cancel' then 'cancelled' else 'declined' end,
      updated_at = now() where id = p_trade_id returning * into trade_row;
    return to_jsonb(trade_row);
  end if;

  if trade_row.status <> 'pending' then raise exception 'This trade is no longer pending.'; end if;

  if p_action = 'offer' then
    if jsonb_typeof(p_offer) <> 'object' then raise exception 'Trade offer is invalid.'; end if;
    offer_tokens := coalesce((p_offer->>'tokens')::integer, 0);
    if offer_tokens < 0 then raise exception 'Token offers cannot be negative.'; end if;
    if jsonb_typeof(coalesce(p_offer->'blooks', '[]'::jsonb)) <> 'array' then raise exception 'Blook offer is invalid.'; end if;

    for item in select value from jsonb_array_elements(coalesce(p_offer->'blooks', '[]'::jsonb)) loop
      item_name := coalesce(item->>'name', '');
      item_quantity := coalesce((item->>'quantity')::integer, 0);
      item_shiny := left(item_name, 6) = 'Shiny ';
      if item_shiny then item_name := substr(item_name, 7); end if;
      if item_name = '' or item_quantity < 1 or item_quantity > 100 then raise exception 'Blook quantities must be between 1 and 100.'; end if;
      select id into item_blook_id from public.blooks where name = item_name;
      if item_blook_id is null then raise exception 'A Blook in this offer is not tradeable.'; end if;
      select quantity into inventory_quantity from public.inventory
        where profile_id = p_profile_id and blook_id = item_blook_id and shiny = item_shiny for update;
      if coalesce(inventory_quantity, 0) < item_quantity then raise exception 'You do not own enough %.', item_name; end if;
    end loop;

    if p_profile_id = trade_row.sender_profile_id then
      select tokens into sender_tokens from public.profiles where id = p_profile_id;
      if coalesce(sender_tokens, 0) < offer_tokens then raise exception 'You do not have enough tokens for this offer.'; end if;
      update public.trades set sender_offer_json = p_offer, sender_confirmed = false,
        receiver_confirmed = false, updated_at = now() where id = p_trade_id returning * into trade_row;
    else
      select tokens into receiver_tokens from public.profiles where id = p_profile_id;
      if coalesce(receiver_tokens, 0) < offer_tokens then raise exception 'You do not have enough tokens for this offer.'; end if;
      update public.trades set receiver_offer_json = p_offer, sender_confirmed = false,
        receiver_confirmed = false, updated_at = now() where id = p_trade_id returning * into trade_row;
    end if;
    return to_jsonb(trade_row);
  end if;

  if p_action <> 'confirm' then raise exception 'Unknown trade action.'; end if;
  if p_profile_id = trade_row.sender_profile_id then
    update public.trades set sender_confirmed = true, updated_at = now() where id = p_trade_id returning * into trade_row;
  else
    update public.trades set receiver_confirmed = true, updated_at = now() where id = p_trade_id returning * into trade_row;
  end if;

  if not (trade_row.sender_confirmed and trade_row.receiver_confirmed) then
    return to_jsonb(trade_row);
  end if;

  perform 1 from public.profiles where id in (trade_row.sender_profile_id, trade_row.receiver_profile_id) order by id for update;
  select tokens into sender_tokens from public.profiles where id = trade_row.sender_profile_id;
  select tokens into receiver_tokens from public.profiles where id = trade_row.receiver_profile_id;

  for sender_item in select value from jsonb_array_elements(coalesce(trade_row.sender_offer_json->'blooks', '[]'::jsonb)) loop
    transfer_name := sender_item->>'name'; transfer_quantity := (sender_item->>'quantity')::integer;
    transfer_shiny := left(transfer_name, 6) = 'Shiny ';
    if transfer_shiny then transfer_name := substr(transfer_name, 7); end if;
    select id into transfer_blook_id from public.blooks where name = transfer_name;
    select * into transfer_row from public.inventory where profile_id = trade_row.sender_profile_id and blook_id = transfer_blook_id and shiny = transfer_shiny for update;
    if not found or transfer_row.quantity < transfer_quantity then raise exception 'Sender inventory changed; update the offer.'; end if;
  end loop;
  for receiver_item in select value from jsonb_array_elements(coalesce(trade_row.receiver_offer_json->'blooks', '[]'::jsonb)) loop
    transfer_name := receiver_item->>'name'; transfer_quantity := (receiver_item->>'quantity')::integer;
    transfer_shiny := left(transfer_name, 6) = 'Shiny ';
    if transfer_shiny then transfer_name := substr(transfer_name, 7); end if;
    select id into transfer_blook_id from public.blooks where name = transfer_name;
    select * into transfer_row from public.inventory where profile_id = trade_row.receiver_profile_id and blook_id = transfer_blook_id and shiny = transfer_shiny for update;
    if not found or transfer_row.quantity < transfer_quantity then raise exception 'Receiver inventory changed; update the offer.'; end if;
  end loop;

  offer_tokens := coalesce((trade_row.sender_offer_json->>'tokens')::integer, 0);
  if sender_tokens < offer_tokens then raise exception 'Sender token balance changed; update the offer.'; end if;
  item_quantity := coalesce((trade_row.receiver_offer_json->>'tokens')::integer, 0);
  if receiver_tokens < item_quantity then raise exception 'Receiver token balance changed; update the offer.'; end if;
  update public.profiles set tokens = tokens - offer_tokens + item_quantity where id = trade_row.sender_profile_id;
  update public.profiles set tokens = tokens - item_quantity + offer_tokens where id = trade_row.receiver_profile_id;

  for sender_item in select value from jsonb_array_elements(coalesce(trade_row.sender_offer_json->'blooks', '[]'::jsonb)) loop
    transfer_name := sender_item->>'name'; transfer_quantity := (sender_item->>'quantity')::integer;
    transfer_shiny := left(transfer_name, 6) = 'Shiny ';
    if transfer_shiny then transfer_name := substr(transfer_name, 7); end if;
    select id into transfer_blook_id from public.blooks where name = transfer_name;
    update public.inventory set quantity = quantity - transfer_quantity
      where profile_id = trade_row.sender_profile_id and blook_id = transfer_blook_id and shiny = transfer_shiny;
    delete from public.inventory where profile_id = trade_row.sender_profile_id and blook_id = transfer_blook_id and shiny = transfer_shiny and quantity = 0;
    insert into public.inventory (profile_id, blook_id, quantity, shiny)
      values (trade_row.receiver_profile_id, transfer_blook_id, transfer_quantity, transfer_shiny)
      on conflict (profile_id, blook_id, shiny) do update set quantity = public.inventory.quantity + excluded.quantity;
  end loop;
  for receiver_item in select value from jsonb_array_elements(coalesce(trade_row.receiver_offer_json->'blooks', '[]'::jsonb)) loop
    transfer_name := receiver_item->>'name'; transfer_quantity := (receiver_item->>'quantity')::integer;
    transfer_shiny := left(transfer_name, 6) = 'Shiny ';
    if transfer_shiny then transfer_name := substr(transfer_name, 7); end if;
    select id into transfer_blook_id from public.blooks where name = transfer_name;
    update public.inventory set quantity = quantity - transfer_quantity
      where profile_id = trade_row.receiver_profile_id and blook_id = transfer_blook_id and shiny = transfer_shiny;
    delete from public.inventory where profile_id = trade_row.receiver_profile_id and blook_id = transfer_blook_id and shiny = transfer_shiny and quantity = 0;
    insert into public.inventory (profile_id, blook_id, quantity, shiny)
      values (trade_row.sender_profile_id, transfer_blook_id, transfer_quantity, transfer_shiny)
      on conflict (profile_id, blook_id, shiny) do update set quantity = public.inventory.quantity + excluded.quantity;
  end loop;

  update public.trades set status = 'completed', updated_at = now() where id = p_trade_id returning * into trade_row;
  return to_jsonb(trade_row);
end;
$$;

revoke all on function public.respond_to_trade(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.respond_to_trade(uuid, uuid, text, jsonb) to service_role;