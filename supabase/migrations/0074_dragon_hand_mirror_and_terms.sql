-- Winter Bag: Christmas Tree Dragon takes the Gnome's place. Gnome stays in the catalog for a future
-- event, and anyone who owns one keeps it.
-- Lost and Found Bag: Comb becomes Hand Mirror. Same rarity and odds. Renaming keeps the same blook
-- id, so everyone who owns a Comb now owns a Hand Mirror.
-- Terms of Service: records which version each player agreed to.

begin;

insert into public.blooks (name, rarity, artwork_key) values
  ('Christmas Tree Dragon', 'Breadled', 'winter/christmas-tree-dragon.svg')
on conflict (name) do update set rarity = excluded.rarity, artwork_key = excluded.artwork_key;

update public.blooks set name = 'Hand Mirror', artwork_key = 'hand-mirror.svg' where name = 'Comb';

-- Locked Breadlets and Bazaar wishlists are saved by name, so rename them there too.
update public.profiles set stats = replace(replace(stats::text, '"Comb"', '"Hand Mirror"'), '"Shiny Comb"', '"Shiny Hand Mirror"')::jsonb
where stats -> 'lockedBlooks' ?| array['Comb', 'Shiny Comb']
  or stats -> 'wishlist' ?| array['Comb', 'Shiny Comb'];

-- So are clan profile Breadlets, the trade history and bag pools.
update public.clans set profile_blook = 'Hand Mirror' where profile_blook = 'Comb';
update public.clans set profile_blook = 'Shiny Hand Mirror' where profile_blook = 'Shiny Comb';
update public.trades set
  sender_offer_json = replace(replace(sender_offer_json::text, '"Comb"', '"Hand Mirror"'), '"Shiny Comb"', '"Shiny Hand Mirror"')::jsonb,
  receiver_offer_json = replace(replace(receiver_offer_json::text, '"Comb"', '"Hand Mirror"'), '"Shiny Comb"', '"Shiny Hand Mirror"')::jsonb
where sender_offer_json::text like '%Comb%' or receiver_offer_json::text like '%Comb%';
update public.chests set pool = replace(pool::text, '"Comb"', '"Hand Mirror"')::jsonb where pool::text like '%"Comb"%';

alter table public.profiles add column if not exists terms_version integer;
alter table public.profiles add column if not exists terms_accepted_at timestamptz;

commit;
