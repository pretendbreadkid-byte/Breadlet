insert into public.blooks (name, rarity, artwork_key)
values ('Leonardo da Vinci''s Tank', 'Epic', 'DaVinci''sOrnothopter2.svg')
on conflict (name) do update
set rarity = excluded.rarity, artwork_key = excluded.artwork_key;