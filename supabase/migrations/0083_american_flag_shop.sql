-- The American Flag for Veterans Day: a Breadlet sold straight off Ted's shelf for 500 Bread Bucks
-- until November 13, 2026 (lib/limited-shop.ts, app/api/shop). The server checks the dates.
-- Unique, one per player: stats.shopBought remembers the purchase, so trading it away doesn't let
-- someone buy another.

insert into public.blooks (name, rarity, artwork_key)
values ('American Flag', 'Unique', 'american-flag.svg')
on conflict (name) do update set rarity = excluded.rarity, artwork_key = excluded.artwork_key;

create or replace function public.buy_shop_blook(p_profile_id uuid, p_item text, p_price integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  player public.profiles%rowtype;
  reward_id uuid;
begin
  if p_price < 0 then raise exception 'Bad price.'; end if;
  select * into player from public.profiles where id = p_profile_id for update;
  if not found then raise exception 'Player not found.'; end if;
  if player.is_banned or player.account_status <> 'active' then
    raise exception 'This account cannot play.';
  end if;
  if coalesce(player.stats->'shopBought', '[]'::jsonb) ? p_item then raise exception 'You already bought the %.', p_item; end if;
  if player.tokens < p_price then raise exception 'You need % Bread Bucks for this.', p_price; end if;

  select id into reward_id from public.blooks where name = p_item;
  if reward_id is null then raise exception '% is missing from the Breadlet catalog.', p_item; end if;

  update public.profiles
  set tokens = tokens - p_price,
      stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object(
        'gameplayRevision', coalesce((stats->>'gameplayRevision')::integer, 0) + 1,
        'shopBought', coalesce(stats->'shopBought', '[]'::jsonb) || to_jsonb(p_item))
  where id = p_profile_id
  returning * into player;

  insert into public.inventory (profile_id, blook_id, quantity, shiny)
  values (p_profile_id, reward_id, 1, false)
  on conflict (profile_id, blook_id, shiny) do update
  set quantity = public.inventory.quantity + 1;

  return jsonb_build_object('tokens', player.tokens, 'item', p_item);
end;
$$;

revoke all on function public.buy_shop_blook(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.buy_shop_blook(uuid, text, integer) to service_role;
