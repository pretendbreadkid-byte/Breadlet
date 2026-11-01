-- Lost and Found Bag: Textbook becomes Book, with new art. Same rarity and odds. Renaming keeps the
-- same blook id, so everyone who owns one keeps it as the new one.

begin;

update public.blooks set name = 'Book', artwork_key = 'book.svg' where name = 'Textbook';

-- Locked Breadlets and Bazaar wishlists are saved by name, so rename them there too.
update public.profiles set stats = replace(replace(stats::text, '"Textbook"', '"Book"'), '"Shiny Textbook"', '"Shiny Book"')::jsonb
where stats -> 'lockedBlooks' ?| array['Textbook', 'Shiny Textbook']
  or stats -> 'wishlist' ?| array['Textbook', 'Shiny Textbook'];

-- So are clan profile Breadlets and the trade history.
update public.clans set profile_blook = 'Book' where profile_blook = 'Textbook';
update public.clans set profile_blook = 'Shiny Book' where profile_blook = 'Shiny Textbook';
update public.trades set
  sender_offer_json = replace(replace(sender_offer_json::text, '"Textbook"', '"Book"'), '"Shiny Textbook"', '"Shiny Book"')::jsonb,
  receiver_offer_json = replace(replace(receiver_offer_json::text, '"Textbook"', '"Book"'), '"Shiny Textbook"', '"Shiny Book"')::jsonb
where sender_offer_json::text like '%Textbook%' or receiver_offer_json::text like '%Textbook%';

commit;
