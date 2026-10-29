-- Fall Bag: Caramel Apple is the new Secret and Tanuki moves up to Breadled.
-- Gears, Map, Gold Bread and Letter get refreshed art.
begin;

insert into public.blooks (name, rarity, artwork_key) values
  ('Caramel Apple', 'Secret', 'fall/caramel-apple-1.svg'),
  ('Tanuki', 'Breadled', 'fall/tanuki-1.svg')
on conflict (name) do update set rarity = excluded.rarity, artwork_key = excluded.artwork_key;

update public.blooks set artwork_key = case name
  when 'Gears' then 'gears-2.svg'
  when 'Map' then 'map-2.svg'
  when 'Gold Bread' then 'gold-bread-3.svg'
  when 'Letter' then 'letter-2.svg'
end
where name in ('Gears', 'Map', 'Gold Bread', 'Letter');

commit;
