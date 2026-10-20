-- Take a 20% fee on tokens exchanged in trades.
do $$
declare
  d text;
  original text;
begin
  select pg_get_functiondef('public.respond_to_trade(uuid,uuid,text,jsonb)'::regprocedure) into d;
  original := d;
  d := replace(d,
    'update public.profiles set tokens = tokens - offer_tokens + item_quantity where id = trade_row.sender_profile_id;',
    'update public.profiles set tokens = tokens - offer_tokens + floor(item_quantity * 0.8)::integer where id = trade_row.sender_profile_id;');
  d := replace(d,
    'update public.profiles set tokens = tokens - item_quantity + offer_tokens where id = trade_row.receiver_profile_id;',
    'update public.profiles set tokens = tokens - item_quantity + floor(offer_tokens * 0.8)::integer where id = trade_row.receiver_profile_id;');
  if d = original then raise exception 'respond_to_trade was not patched'; end if;
  execute d;
end $$;