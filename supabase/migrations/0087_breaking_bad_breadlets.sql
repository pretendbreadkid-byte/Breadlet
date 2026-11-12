-- Breadlet Breaks Bad (upcoming event): its first four Breadlets, Unique. Nothing drops them yet;
-- admins can give them from the Admin Panel. Art in public/assets/breaking-bad/.
insert into public.blooks (name, rarity, artwork_key) values
  ('Heisenberg Sketch', 'Unique', 'breaking-bad/heisenberg-sketch.png'),
  ('Methylamine', 'Unique', 'breaking-bad/methylamine.png'),
  ('Gus Fring', 'Unique', 'breaking-bad/gus-fring.svg'),
  ('Flask', 'Unique', 'breaking-bad/flask.svg')
on conflict (name) do update set rarity = excluded.rarity, artwork_key = excluded.artwork_key;
