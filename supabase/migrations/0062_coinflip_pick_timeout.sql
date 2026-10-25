-- Coin flips: once someone joins, the host has 30 seconds to pick heads or tails. Otherwise
-- the flip is cancelled and both players get their Bread Bucks back. The games API calls this
-- before every game action and poll.
create or replace function public.chat_game_expire_flips()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.chat_games%rowtype;
  host_name text;
  expired integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Server access is required.';
  end if;
  for g in select * from public.chat_games
    where kind = 'coinflip' and status = 'active' and updated_at < now() - interval '30 seconds'
    for update skip locked loop
    update public.profiles set tokens = tokens + g.bet where id = g.host_id;
    if g.opponent_id is not null then update public.profiles set tokens = tokens + g.bet where id = g.opponent_id; end if;
    update public.chat_games set status = 'expired', updated_at = now() where id = g.id;
    select username into host_name from public.profiles where id = g.host_id;
    perform public.chat_game_bot_say(g.host_id, coalesce(host_name, 'The host') || ' didn''t pick heads or tails in 30 seconds, so the coin flip was cancelled. Bread Bucks were refunded.');
    expired := expired + 1;
  end loop;
  return expired;
end;
$$;

revoke all on function public.chat_game_expire_flips() from public, anon, authenticated;
grant execute on function public.chat_game_expire_flips() to service_role;
