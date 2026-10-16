begin;

insert into public.blooks (name, rarity, artwork_key, retired) values
  ('Wallet', 'Uncommon', 'wallet.svg', false),
  ('Sword', 'Rare', 'sword.svg', false),
  ('Rock', 'Common', 'rock-refreshed.svg', false),
  ('Candy Corn', 'Rare', 'candy-corn-refreshed.svg', false)
on conflict (name) do update
set rarity = excluded.rarity,
    artwork_key = excluded.artwork_key,
    retired = excluded.retired;

update public.chests
set pool = pool || '["Wallet"]'::jsonb
where name = 'Lost and Found Bag'
  and not (pool @> '["Wallet"]'::jsonb);

update public.chests
set pool = pool || '["Sword"]'::jsonb
where name = 'Combat Bag'
  and not (pool @> '["Sword"]'::jsonb);

commit;
