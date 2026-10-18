begin;

insert into public.blooks (name, rarity, artwork_key, retired)
values
  ('Olive Grenade', 'Common', 'grenade2.svg', false),
  ('Golden Grenade', 'Rare', 'gold grenade2.svg', false),
  ('Shuriken', 'Uncommon', 'shuricken 2.svg', false),
  ('Spartan', 'Legendary', 'spartin  2.svg', false),
  ('Golden Shuriken', 'Mythic', 'gold shuricken 2.svg', false),
  ('Diamond Sword', 'Breadled', 'diamond sword frame one.svg', false)
on conflict (name) do update
set rarity = excluded.rarity,
    artwork_key = excluded.artwork_key,
    retired = excluded.retired;

update public.chests
set pool = '["Olive Grenade","The Bomb","Golden Grenade","Sword","Shuriken","Nunchucks","Spartan","Golden Shuriken","Diamond Sword"]'::jsonb
where name = 'Combat Bag';

notify pgrst, 'reload schema';

commit;
