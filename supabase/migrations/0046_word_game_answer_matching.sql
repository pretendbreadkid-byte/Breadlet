-- Word games: anyone can win (including the starter) and answers match ignoring case, spaces and punctuation.
do $$
declare
  d text;
begin
  select pg_get_functiondef('public.chat_game_action(uuid,text,integer,text,text,text,text,text)'::regprocedure) into d;
  d := replace(d, 'where kind in (''wordrace'', ''unscramble'') and status = ''open'' and host_id <> p_profile_id', 'where kind in (''wordrace'', ''unscramble'') and status = ''open''');
  d := replace(d, 'and lower(trim(coalesce(p_message, ''''))) = answer', 'and regexp_replace(lower(coalesce(p_message, '''')), ''[^a-z]'', '''', ''g'') = answer');
  execute d;
end $$;
