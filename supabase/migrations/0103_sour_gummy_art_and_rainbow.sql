-- New art for the Sour Gummies, and the Rainbow Sour Gummy (Breadled) joins the Candy Bag.
update public.blooks set artwork_key = 'candy/red-sour-gummy-2.webp' where name = 'Red Sour Gummy';
update public.blooks set artwork_key = 'candy/green-sour-gummy-2.webp' where name = 'Green Sour Gummy';
update public.blooks set artwork_key = 'candy/blue-sour-gummy-2.png' where name = 'Blue Sour Gummy';
insert into public.blooks (name, rarity, artwork_key) values ('Rainbow Sour Gummy', 'Breadled', 'candy/rainbow-sour-gummy.gif')
on conflict (name) do update set rarity = excluded.rarity, artwork_key = excluded.artwork_key;
