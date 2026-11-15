-- Candy Bag Breadlets. Opening a pack saves rewards by blook id, so every Breadlet needs a row.
-- Chocolate Coin (also in the Winter Bag) gets the new Candy Bag art.
insert into public.blooks (name, rarity, artwork_key) values
  ('Lollipop', 'Common', 'candy/lollipop.svg'),
  ('Gumdrop', 'Common', 'candy/gumdrop.svg'),
  ('Gummy Bear', 'Common', 'candy/gummy-bear.svg'),
  ('Red Sour Gummy', 'Uncommon', 'candy/red-sour-gummy.svg'),
  ('Green Sour Gummy', 'Uncommon', 'candy/green-sour-gummy.svg'),
  ('Chocolate Coin', 'Uncommon', 'candy/chocolate-coin.svg'),
  ('Blue Sour Gummy', 'Rare', 'candy/blue-sour-gummy.svg'),
  ('Chocolate Kiss', 'Rare', 'candy/chocolate-kiss.svg'),
  ('Marshmallow Bunny', 'Epic', 'candy/marshmallow-chick.webp'),
  ('King Candy', 'Mythic', 'candy/king-candy.svg'),
  ('Golden Ticket', 'Secret', 'candy/golden-ticket.svg')
on conflict (name) do update set rarity = excluded.rarity, artwork_key = excluded.artwork_key;
