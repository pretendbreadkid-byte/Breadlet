-- Toxic Bag (lib/gameplay-catalog.ts): opening a pack saves rewards by blook id, so each Breadlet
-- needs a catalog row. Art lives in public/assets/toxic/.
insert into public.blooks (name, rarity, artwork_key) values
  ('Toxic Mushroom', 'Common', 'toxic/toxic-mushroom.webp'),
  ('Hazard Symbol', 'Common', 'toxic/hazard-symbol.webp'),
  ('Ooze Slime', 'Common', 'toxic/ooze-slime.webp'),
  ('Radioactive Rat', 'Uncommon', 'toxic/radioactive-rat.webp'),
  ('Power Plant', 'Uncommon', 'toxic/power-plant.svg'),
  ('Radioactive Spider', 'Rare', 'toxic/radioactive-spider.webp'),
  ('Uranium', 'Rare', 'toxic/uranium.svg'),
  ('Mutated Cat', 'Epic', 'toxic/mutated-cat.webp'),
  ('Ooze Goblin', 'Epic', 'toxic/ooze-goblin.webp'),
  ('Ooze Scientist', 'Legendary', 'toxic/ooze-scientist.svg'),
  ('Hazmat Ted', 'Mythic', 'toxic/hazmat-ted.svg'),
  ('Corrupted Breadlet', 'Secret', 'toxic/corrupted-breadlet.webp'),
  ('Toxic Dragon', 'Breadled', 'toxic/toxic-dragon.webp')
on conflict (name) do update set rarity = excluded.rarity, artwork_key = excluded.artwork_key;

notify pgrst, 'reload schema';
