-- Backyard Bag (lib/gameplay-catalog.ts) and two new Fall Bag Breadlets. Opening a pack saves
-- rewards by blook id, so each Breadlet needs a catalog row.
insert into public.blooks (name, rarity, artwork_key) values
  ('Chalk', 'Common', 'breadlets/backyard-bag/chalk.webp'),
  ('Shovel', 'Common', 'breadlets/backyard-bag/shovel.webp'),
  ('Trowel', 'Common', 'breadlets/backyard-bag/trowel.webp'),
  ('Frisbee', 'Uncommon', 'breadlets/backyard-bag/frisbee.webp'),
  ('Sand Pit', 'Uncommon', 'breadlets/backyard-bag/sand-pit.webp'),
  ('Pool', 'Uncommon', 'breadlets/backyard-bag/pool.webp'),
  ('Cactus', 'Rare', 'breadlets/backyard-bag/cactus.webp'),
  ('Bee Hive', 'Rare', 'breadlets/backyard-bag/bee-hive.webp'),
  ('Sunflower', 'Epic', 'breadlets/backyard-bag/sunflower.webp'),
  ('Firefly', 'Legendary', 'breadlets/backyard-bag/firefly.webp'),
  ('Garden Gnome', 'Mythic', 'breadlets/backyard-bag/garden-gnome.webp'),
  ('Queen Bee', 'Breadled', 'breadlets/backyard-bag/queen-bee.webp'),
  ('Pilgrim Ted', 'Secret', 'breadlets/fall-bag/pilgrim-ted.webp'),
  ('Autumn Kitsune', 'Breadled', 'breadlets/fall-bag/autumn-kitsune.webp')
on conflict (name) do update set rarity = excluded.rarity, artwork_key = excluded.artwork_key;

notify pgrst, 'reload schema';
