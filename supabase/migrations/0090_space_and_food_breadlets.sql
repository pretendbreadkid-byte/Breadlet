-- New Breadlets: Martian (Legendary) and Astronaut (Mythic) in the Space Bag; Pepper (Rare) and
-- Ghost Pepper (Mythic) in the Food Bag.
insert into public.blooks (name, rarity, artwork_key) values
  ('Martian', 'Legendary', 'martian.webp'),
  ('Astronaut', 'Mythic', 'astronaut.webp'),
  ('Pepper', 'Rare', 'pepper.webp'),
  ('Ghost Pepper', 'Mythic', 'ghost-pepper.webp')
on conflict (name) do update set rarity = excluded.rarity, artwork_key = excluded.artwork_key;
