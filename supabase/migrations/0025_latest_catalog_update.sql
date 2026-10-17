begin;

insert into public.blooks (name, rarity, artwork_key, retired) values
  ('Aztec Coin', 'Common', 'Aztect Coin 2.0.svg', false),
  ('Earth', 'Uncommon', 'Lost and found + food pack/earth 2.svg', false),
  ('Globe', 'Uncommon', 'earth-globe.svg', false),
  ('Coffee Mug', 'Common', 'coffee-mug.svg', false),
  ('Clay Vase', 'Common', 'clay-vase.svg', false),
  ('Magnifying Glass', 'Common', 'magnifying-glass.svg', false)
on conflict (name) do update
set rarity = excluded.rarity,
    artwork_key = excluded.artwork_key,
    retired = excluded.retired;

update public.blooks
set rarity = case name
  when 'Space Trooper' then 'Uncommon'
  when 'Consolation' then 'Uncommon'
  when 'Avocado' then 'Common'
  when 'Shuriken' then 'Uncommon'
  when 'Blooket Gods' then 'Common'
  when 'Robo Bread' then 'Uncommon'
end
where name in ('Space Trooper', 'Consolation', 'Avocado', 'Shuriken', 'Blooket Gods', 'Robo Bread');

update public.chests
set pool = pool || '["Coffee Mug"]'::jsonb
where name = 'Lost and Found Bag'
  and not (pool @> '["Coffee Mug"]'::jsonb);

update public.chests
set pool = pool || '["Clay Vase"]'::jsonb
where name = 'Artifact Bag'
  and not (pool @> '["Clay Vase"]'::jsonb);

update public.chests
set pool = pool || '["Magnifying Glass"]'::jsonb
where name = 'Inventions Bag'
  and not (pool @> '["Magnifying Glass"]'::jsonb);

update public.chests
set pool = pool || '["Globe"]'::jsonb
where name = 'Space Bag'
  and not (pool @> '["Globe"]'::jsonb);

commit;
