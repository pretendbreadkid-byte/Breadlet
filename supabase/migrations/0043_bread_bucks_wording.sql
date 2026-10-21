-- Rename "tokens" to "Bread Bucks" in chat game bot messages and errors.
do $$
declare
  d text;
  original text;
  pair text[];
begin
  select pg_get_functiondef('public.chat_game_action(uuid,text,integer,text,text,text,text,text)'::regprocedure) into d;
  original := d;
  foreach pair slice 1 in array array[
    array[' tokens!', ' Bread Bucks!'],
    array[' token pot.', ' Bread Buck pot.'],
    array[' tokens.''', ' Bread Bucks.'''],
    array[' tokens'' ||', ' Bread Bucks'' ||'],
    array['1,000,000 tokens', '1,000,000 Bread Bucks'],
    array['enough tokens for', 'enough Bread Bucks for'],
    array['% tokens to join', '% Bread Bucks to join'],
    array['300 token daily game limit, so no tokens this time', '300 Bread Bucks daily game limit, so no Bread Bucks this time'],
    array['rewarded '' || reward || '' tokens', 'rewarded '' || reward || '' Bread Bucks']
  ] loop
    d := replace(d, pair[1], pair[2]);
  end loop;
  if d <> original then execute d; end if;
end $$;
