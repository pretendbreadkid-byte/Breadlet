-- Minti's Holiday Edition: a Legendary in the Winter (Christmas) Bag. Opening a pack saves rewards
-- by blook id, so the Breadlet needs a catalog row.
insert into public.blooks (name, rarity, artwork_key) values
  ('Minti''s Holiday Edition', 'Legendary', 'winter/mintis-holiday-edition.webp')
on conflict (name) do update set rarity = excluded.rarity, artwork_key = excluded.artwork_key;

notify pgrst, 'reload schema';
