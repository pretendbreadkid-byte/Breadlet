insert into public.blooks (name, rarity, artwork_key)
values ('Alien', 'Mythic', 'alien 2 frame 1.svg')
on conflict (name) do update
set artwork_key = excluded.artwork_key;
