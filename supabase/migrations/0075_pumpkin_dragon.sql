-- Fall Fiesta: the Pumpkin Dragon joins the leaf shop. Unique, like the other leaf shop Breadlets.

insert into public.blooks (name, rarity, artwork_key) values
  ('Pumpkin Dragon', 'Unique', 'fall/pumpkin-dragon.svg')
on conflict (name) do update set rarity = excluded.rarity, artwork_key = excluded.artwork_key;
