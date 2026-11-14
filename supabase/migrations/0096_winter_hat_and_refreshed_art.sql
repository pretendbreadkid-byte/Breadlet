-- Winter Hat joins the Winter Bag as a Common; refreshed art for Sour Dough, Clay Vase, Globe and Croissant.
insert into public.blooks (name, rarity, artwork_key) values ('Winter Hat', 'Common', 'winter/winter-hat.svg')
on conflict (name) do update set rarity = excluded.rarity, artwork_key = excluded.artwork_key;
update public.blooks set artwork_key = 'sour-dough-2.svg' where name = 'Sour Dough';
update public.blooks set artwork_key = 'clay-vase-2.svg' where name = 'Clay Vase';
update public.blooks set artwork_key = 'earth-globe-2.svg' where name = 'Globe';
update public.blooks set artwork_key = 'croissant-2.svg' where name = 'Croissant';
