begin;

insert into public.blooks (name, rarity, artwork_key, retired) values
  ('Aztec Coin', 'Common', 'aztec-coin-updated.svg', false),
  ('Earth', 'Uncommon', 'earth-globe.svg', false),
  ('Coffee Mug', 'Common', 'coffee-mug.svg', false),
  ('Clay Vase', 'Common', 'clay-vase.svg', false)
on conflict (name) do update
set rarity = excluded.rarity,
    artwork_key = excluded.artwork_key,
    retired = excluded.retired;

update public.chests
set pool = pool || '["Coffee Mug"]'::jsonb
where name = 'Lost and Found Bag'
  and not (pool @> '["Coffee Mug"]'::jsonb);

update public.chests
set pool = pool || '["Clay Vase"]'::jsonb
where name = 'Artifact Bag'
  and not (pool @> '["Clay Vase"]'::jsonb);

commit;
