begin;

insert into public.blooks (name, rarity, artwork_key, retired) values
  ('Sun', 'Rare', 'sun.svg', false),
  ('Eclipse', 'Epic', 'solar ecplise but good.svg', false),
  ('Sour Dough', 'Common', 'sour-dough-refreshed.svg', false),
  ('Toaster', 'Common', 'toaster-bread.svg', false),
  ('Croissant', 'Common', 'croissant.svg', false),
  ('Cinnamon Roll', 'Uncommon', 'cinnamon-roll-refreshed.svg', false),
  ('Robo Bread', 'Rare', 'robo-bread.svg', false),
  ('Slime Bread', 'Rare', 'slime-bread.svg', false),
  ('Gold Bread', 'Legendary', 'gold-bread-refreshed.svg', false),
  ('Holy Bread', 'Mythic', 'holy-bread-refreshed.svg', false)
on conflict (name) do update
set rarity = excluded.rarity,
    artwork_key = excluded.artwork_key,
    retired = excluded.retired;

update public.blooks
set retired = true
where name in (
  'Worker', 'Chef', 'Doctor', 'Ninja', 'Actor', 'Caveman',
  'Pixel Apple', 'Pixel Caramel', 'Pixel Crystal Ball', 'Pixel Bomb',
  'Pixel Constellation', 'Pixel Aztec Coin', 'Pixel Lagoon', 'Pixel Sprinkle Bread',
  'Red Rex', 'Albino Crow', 'Mr. Frog', 'Crimson Octopus', 'Lava Slime',
  'Burnt Toast', 'Brioche', 'Donut'
);

update public.chests
set active = false, is_retired = true
where name in ('Human Bag', 'Pixel Bag', 'Remix Bag');

insert into public.chests (name, price, description, pool, rarity, is_retired, active)
values (
  'Bread Bag',
  25,
  'Freshly baked Breadlets from Ted.',
  '["Sour Dough", "Toaster", "Croissant", "Cinnamon Roll", "Robo Bread", "Slime Bread", "Gold Bread", "Holy Bread"]'::jsonb,
  'Mythic',
  false,
  true
)
on conflict (name) do update
set price = excluded.price,
    description = excluded.description,
    pool = excluded.pool,
    rarity = excluded.rarity,
    is_retired = excluded.is_retired,
    active = excluded.active;

commit;
