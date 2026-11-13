-- Breadlet Breaks Bad: Mike and Battle Scarred Mike, and the Flask gets its new art.
insert into public.blooks (name, rarity, artwork_key) values
  ('Mike', 'Unique', 'breaking-bad/mike.svg'),
  ('Battle Scarred Mike', 'Unique', 'breaking-bad/battle-scarred-mike.svg'),
  ('Flask', 'Unique', 'breaking-bad/flask-2.svg')
on conflict (name) do update set rarity = excluded.rarity, artwork_key = excluded.artwork_key;
