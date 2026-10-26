-- Fall Bag Breadlets (the pack opens November 1, 2026). Opening a pack saves rewards by
-- blook id, so every Breadlet in the pack needs a catalog row.
insert into public.blooks (name, rarity, artwork_key) values
  ('Pumpkin', 'Common', 'fall/pumpkin.svg'),
  ('Chai Tea', 'Common', 'fall/chai-tea.svg'),
  ('Cherry Pie', 'Uncommon', 'fall/cherry-pie.svg'),
  ('Pumpkin Pie', 'Uncommon', 'fall/pumpkin-pie.webp'),
  ('Corn', 'Rare', 'fall/corn.webp'),
  ('Cooked Turkey', 'Legendary', 'fall/cooked-turkey.svg'),
  ('Tanuki', 'Mythic', 'fall/tanuki-1.svg')
on conflict (name) do update set rarity = excluded.rarity, artwork_key = excluded.artwork_key;
