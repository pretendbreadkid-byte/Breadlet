-- Chimney replaces Chocolate Coin in the Winter Bag (Chocolate Coin stays in the Candy Bag).
insert into public.blooks (name, rarity, artwork_key) values ('Chimney', 'Uncommon', 'winter/chimney.svg')
on conflict (name) do update set rarity = excluded.rarity, artwork_key = excluded.artwork_key;
