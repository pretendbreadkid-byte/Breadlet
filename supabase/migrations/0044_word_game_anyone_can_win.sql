-- Word games: allow anyone (including the player who started the game) to win.
do $$
declare
  d text;
  original text;
begin
  select pg_get_functiondef('public.chat_game_action(uuid,text,integer,text,text,text,text,text)'::regprocedure) into d;
  original := d;
  d := replace(d, 'where kind in (''wordrace'', ''unscramble'') and status = ''open'' and host_id <> p_profile_id', 'where kind in (''wordrace'', ''unscramble'') and status = ''open''');
  if d = original then raise exception 'chat_game_action was not patched'; end if;
  execute d;
end $$;