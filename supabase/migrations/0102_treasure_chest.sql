-- Treasure Chest (Mythic) joins the Artifact Bag.
insert into public.blooks (name, rarity, artwork_key) values ('Treasure Chest', 'Mythic', 'treasure-chest.svg')
on conflict (name) do update set rarity = excluded.rarity, artwork_key = excluded.artwork_key;
