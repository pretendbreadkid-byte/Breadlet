-- Winter Bag Breadlets (the pack opens December 1, 2026). Opening a pack saves rewards by
-- blook id, so every Breadlet in the pack needs a catalog row.
insert into public.blooks (name, rarity, artwork_key) values
  ('Snowball', 'Common', 'winter/snowball.svg'),
  ('Mitten', 'Common', 'winter/mitten.svg'),
  ('Christmas Candy', 'Common', 'winter/christmas-candy.svg'),
  ('Santa Hat', 'Uncommon', 'winter/santa-hat.svg'),
  ('Ornament', 'Uncommon', 'winter/ornament.svg'),
  ('Chocolate Coin', 'Uncommon', 'winter/chocolate-coin.svg'),
  ('Stocking', 'Rare', 'winter/stocking.svg'),
  ('Chocolate Candy Cookie', 'Rare', 'winter/chocolate-candy-cookie.svg'),
  ('Sugar Cookie', 'Rare', 'winter/sugar-cookie.svg'),
  ('Macadamia Nut Cookie', 'Rare', 'winter/macadamia-nut-cookie.svg'),
  ('Gingerbread Cookie', 'Rare', 'winter/gingerbread-cookie.svg'),
  ('Present', 'Epic', 'winter/present.svg'),
  ('Festive Breadlet', 'Legendary', 'winter/festive-breadlet.svg'),
  ('Reindeer', 'Mythic', 'winter/reindeer-1.svg'),
  ('Gnome', 'Breadled', 'winter/gnome-1.svg')
on conflict (name) do update set rarity = excluded.rarity, artwork_key = excluded.artwork_key;
