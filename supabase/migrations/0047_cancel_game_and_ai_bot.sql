-- Let the server post bot messages (used by /ai) and let players cancel their own games (/cancel).
grant execute on function public.chat_game_bot_say(uuid, text) to service_role;

create or replace function public.chat_game_cancel(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me record;
  g public.chat_games%rowtype;
  cancelled integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Server access is required.';
  end if;
  select id, username into me from public.profiles where id = p_profile_id;
  if not found then raise exception 'Player not found.'; end if;

  for g in select * from public.chat_games
    where status in ('open', 'active') and (host_id = p_profile_id or opponent_id = p_profile_id)
    for update loop
    if g.kind = 'coinflip' then
      update public.profiles set tokens = tokens + g.bet where id = g.host_id;
      if g.opponent_id is not null then update public.profiles set tokens = tokens + g.bet where id = g.opponent_id; end if;
    end if;
    update public.chat_games set status = 'expired', updated_at = now() where id = g.id;
    cancelled := cancelled + 1;
    perform public.chat_game_bot_say(p_profile_id, me.username || ' cancelled their ' ||
      case g.kind when 'coinflip' then 'coin flip' when 'wordrace' then 'word race' else 'unscramble' end ||
      '.' || case when g.kind = 'coinflip' and g.bet > 0 then ' Bread Bucks were refunded.' else '' end);
  end loop;

  if cancelled = 0 then raise exception 'You have no game to cancel.'; end if;
  return jsonb_build_object('cancelled', cancelled);
end;
$$;

revoke all on function public.chat_game_cancel(uuid) from public, anon, authenticated;
grant execute on function public.chat_game_cancel(uuid) to service_role;
