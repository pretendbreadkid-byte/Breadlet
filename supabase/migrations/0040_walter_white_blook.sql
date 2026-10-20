insert into public.blooks (name, rarity, artwork_key)
values ('Walter White', 'Unique', 'walter-white.svg')
on conflict (name) do update set rarity = excluded.rarity, artwork_key = excluded.artwork_key;
