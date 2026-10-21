-- Hourly token claims: the crate can be opened once per hour instead of once per day.
do $$
declare
  d text;
  original text;
  fn text;
begin
  foreach fn in array array[
    'public.apply_gameplay_action_before_spooky_close(uuid,integer,text,integer,jsonb,jsonb,integer,integer)',
    'public.apply_gameplay_action(uuid,integer,text,integer,jsonb,jsonb,integer,integer)'
  ] loop
    begin
      select pg_get_functiondef(fn::regprocedure) into d;
    exception when undefined_function then
      continue;
    end;
    original := d;
    d := replace(d,
      '((next_stats->>''wheelSpunAt'')::timestamptz at time zone ''UTC'')::date = (now() at time zone ''UTC'')::date',
      '(next_stats->>''wheelSpunAt'')::timestamptz > now() - interval ''1 hour''');
    d := replace(d, 'You already opened today''''s Daily Crate.', 'You can claim tokens again once an hour has passed.');
    if d <> original then execute d; end if;
  end loop;
end $$;

-- Chat mini games (coin flip, word race, unscramble).
create table if not exists public.chat_games (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('coinflip', 'wordrace', 'unscramble')),
  status text not null default 'open' check (status in ('open', 'active', 'done', 'expired')),
  host_id uuid not null references public.profiles(id) on delete cascade,
  opponent_id uuid references public.profiles(id) on delete cascade,
  bet integer not null default 0 check (bet >= 0),
  answer text,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists chat_games_status_idx on public.chat_games (status, created_at);
alter table public.chat_games enable row level security;
revoke all on public.chat_games from anon, authenticated;

create or replace function public.chat_game_bot_say(p_profile_id uuid, p_message text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.breadlet_bot_insert', 'true', true);
  insert into public.global_chat_messages (profile_id, message, is_breadlet_bot, created_at)
  values (p_profile_id, left(p_message, 500), true, clock_timestamp());
  perform set_config('app.breadlet_bot_insert', 'false', true);
end;
$$;

create or replace function public.chat_game_action(
  p_profile_id uuid,
  p_action text,
  p_bet integer default 0,
  p_choice text default null,
  p_answer text default null,
  p_display text default null,
  p_hint text default null,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me record;
  other record;
  g public.chat_games%rowtype;
  stale record;
  flip text;
  winner uuid;
  winner_name text;
  today text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD');
  earned integer;
  reward integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Server access is required.';
  end if;
  select id, username, tokens, stats into me from public.profiles where id = p_profile_id for update;
  if not found then raise exception 'Player not found.'; end if;

  -- Refund coin flips that nobody joined or finished.
  for stale in select * from public.chat_games
    where kind = 'coinflip' and status in ('open', 'active')
      and created_at < now() - (case when status = 'open' then interval '10 minutes' else interval '3 minutes' end)
    for update skip locked loop
    update public.profiles set tokens = tokens + stale.bet where id = stale.host_id;
    if stale.opponent_id is not null then update public.profiles set tokens = tokens + stale.bet where id = stale.opponent_id; end if;
    update public.chat_games set status = 'expired', updated_at = now() where id = stale.id;
  end loop;
  update public.chat_games set status = 'expired', updated_at = now()
    where kind in ('wordrace', 'unscramble') and status = 'open' and created_at < now() - interval '5 minutes';

  if p_action = 'coinflip_start' then
    if p_bet < 1 or p_bet > 1000000 then raise exception 'Bet between 1 and 1,000,000 tokens.'; end if;
    if me.tokens < p_bet then raise exception 'You do not have enough tokens for that bet.'; end if;
    if exists (select 1 from public.chat_games where kind = 'coinflip' and status in ('open', 'active') and (host_id = p_profile_id or opponent_id = p_profile_id)) then
      raise exception 'You are already in a coin flip.';
    end if;
    update public.profiles set tokens = tokens - p_bet where id = p_profile_id;
    insert into public.chat_games (kind, host_id, bet) values ('coinflip', p_profile_id, p_bet) returning * into g;
    perform public.chat_game_bot_say(p_profile_id, me.username || ' has activated a coin flip for ' || p_bet || ' tokens! Type /accept to join this bet and put in the same amount.');
    return to_jsonb(g);
  end if;

  if p_action = 'coinflip_accept' then
    select * into g from public.chat_games where kind = 'coinflip' and status = 'open' and host_id <> p_profile_id order by created_at desc limit 1 for update;
    if not found then raise exception 'There is no coin flip to accept right now.'; end if;
    if exists (select 1 from public.chat_games where kind = 'coinflip' and status in ('open', 'active') and (host_id = p_profile_id or opponent_id = p_profile_id)) then
      raise exception 'You are already in a coin flip.';
    end if;
    if me.tokens < g.bet then raise exception 'You need % tokens to join this bet.', g.bet; end if;
    update public.profiles set tokens = tokens - g.bet where id = p_profile_id;
    update public.chat_games set status = 'active', opponent_id = p_profile_id, updated_at = now() where id = g.id returning * into g;
    select username into other from public.profiles where id = g.host_id;
    perform public.chat_game_bot_say(p_profile_id, me.username || ' joined ' || other.username || '''s coin flip! ' || other.username || ' is picking heads or tails for the ' || (g.bet * 2) || ' token pot.');
    return to_jsonb(g);
  end if;

  if p_action = 'coinflip_pick' then
    if p_choice not in ('heads', 'tails') then raise exception 'Pick heads or tails.'; end if;
    select * into g from public.chat_games where kind = 'coinflip' and status = 'active' and host_id = p_profile_id order by created_at desc limit 1 for update;
    if not found then raise exception 'No active coin flip to pick for.'; end if;
    flip := case when random() < 0.5 then 'heads' else 'tails' end;
    winner := case when flip = p_choice then g.host_id else g.opponent_id end;
    update public.profiles set tokens = tokens + g.bet * 2 where id = winner;
    select username into winner_name from public.profiles where id = winner;
    update public.chat_games set status = 'done', updated_at = now(),
      result = jsonb_build_object('pick', p_choice, 'flip', flip, 'winnerId', winner, 'winnerName', winner_name)
      where id = g.id returning * into g;
    perform public.chat_game_bot_say(p_profile_id, 'The coin landed on ' || flip || '! ' || winner_name || ' won ' || (g.bet * 2) || ' tokens.');
    return to_jsonb(g);
  end if;

  if p_action in ('wordrace_start', 'unscramble_start') then
    if coalesce(p_answer, '') !~ '^[a-z]{3,20}$' then raise exception 'Invalid word.'; end if;
    if exists (select 1 from public.chat_games where kind in ('wordrace', 'unscramble') and status = 'open') then
      raise exception 'A word game is already running. Solve it first!';
    end if;
    if exists (select 1 from public.chat_games where kind in ('wordrace', 'unscramble') and created_at > now() - interval '30 seconds') then
      raise exception 'Please wait a moment before starting another word game.';
    end if;
    insert into public.chat_games (kind, host_id, answer)
      values (case when p_action = 'wordrace_start' then 'wordrace' else 'unscramble' end, p_profile_id, p_answer) returning * into g;
    if p_action = 'wordrace_start' then
      perform public.chat_game_bot_say(p_profile_id, 'WORDRACE! Be the first one to type this word to win: ' || left(coalesce(p_display, p_answer), 80));
    else
      perform public.chat_game_bot_say(p_profile_id, 'Unscramble this word! Hint: ' || left(coalesce(p_hint, 'none'), 80) || ' - ' || left(coalesce(p_display, p_answer), 40));
    end if;
    return jsonb_build_object('id', g.id);
  end if;

  if p_action = 'check_answer' then
    select * into g from public.chat_games where kind in ('wordrace', 'unscramble') and status = 'open' and host_id <> p_profile_id
      and lower(trim(coalesce(p_message, ''))) = answer order by created_at desc limit 1 for update;
    if not found then return jsonb_build_object('won', false); end if;
    earned := case when me.stats->'gameRewards'->>'date' = today then coalesce((me.stats->'gameRewards'->>'amount')::integer, 0) else 0 end;
    reward := greatest(0, least(5, 300 - earned));
    update public.profiles set tokens = tokens + reward,
      stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object('gameRewards', jsonb_build_object('date', today, 'amount', earned + reward))
      where id = p_profile_id;
    update public.chat_games set status = 'done', opponent_id = p_profile_id, updated_at = now(), result = jsonb_build_object('winnerName', me.username) where id = g.id;
    perform public.chat_game_bot_say(p_profile_id, case when reward > 0
      then 'Congrats @' || me.username || ' won! You have been rewarded ' || reward || ' tokens.'
      else 'Congrats @' || me.username || ' won! You hit the 300 token daily game limit, so no tokens this time.' end);
    return jsonb_build_object('won', true, 'reward', reward);
  end if;

  raise exception 'Unknown game action.';
end;
$$;

revoke all on function public.chat_game_bot_say(uuid, text) from public, anon, authenticated;
revoke all on function public.chat_game_action(uuid, text, integer, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.chat_game_action(uuid, text, integer, text, text, text, text, text) to service_role;
