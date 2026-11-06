-- The BlookTuber Bag becomes the YouTube Bag. Five of its Breadlets get new names and art, at the
-- same rarity. Renaming keeps the same blook id, so everyone who owns one now owns the replacement.
-- Gold Play Button is the bag's new Secret. Frozen Ted joins the Winter Bag as its Mythic.

begin;

insert into public.blooks (name, rarity, artwork_key) values
  ('Gold Play Button', 'Secret', 'gold-play-button.svg'),
  ('Frozen Ted', 'Mythic', 'winter/frozen-ted.svg')
on conflict (name) do update set rarity = excluded.rarity, artwork_key = excluded.artwork_key;

create temporary table youtube_renames (old_name text primary key, new_name text not null, art text not null) on commit drop;
insert into youtube_renames values
  ('Blook Master', 'Silver Play Button', 'silver-play-button.svg'),
  ('Waymore', 'Green Screen', 'green-screen.svg'),
  ('Turtwix', 'YouTube Logo', 'youtube-logo.svg'),
  ('Blooket Life', 'Camera', 'camera.svg'),
  ('Lagoon', 'Microphone', 'microphone.svg');

update public.blooks b set name = r.new_name, artwork_key = r.art
from youtube_renames r where b.name = r.old_name;

-- Locked Breadlets, wishlists, clan profile Breadlets, trade offers and bag pools are saved by name,
-- so rename them there too (plain and Shiny).
do $$
declare
  r record;
begin
  for r in select * from youtube_renames loop
    update public.profiles
    set stats = replace(replace(stats::text, '"' || r.old_name || '"', '"' || r.new_name || '"'), '"Shiny ' || r.old_name || '"', '"Shiny ' || r.new_name || '"')::jsonb
    where stats -> 'lockedBlooks' ?| array[r.old_name, 'Shiny ' || r.old_name]
      or stats -> 'wishlist' ?| array[r.old_name, 'Shiny ' || r.old_name];

    update public.clans set profile_blook = r.new_name where profile_blook = r.old_name;
    update public.clans set profile_blook = 'Shiny ' || r.new_name where profile_blook = 'Shiny ' || r.old_name;

    update public.trades set
      sender_offer_json = replace(replace(sender_offer_json::text, '"' || r.old_name || '"', '"' || r.new_name || '"'), '"Shiny ' || r.old_name || '"', '"Shiny ' || r.new_name || '"')::jsonb,
      receiver_offer_json = replace(replace(receiver_offer_json::text, '"' || r.old_name || '"', '"' || r.new_name || '"'), '"Shiny ' || r.old_name || '"', '"Shiny ' || r.new_name || '"')::jsonb
    where sender_offer_json::text like '%' || r.old_name || '%' or receiver_offer_json::text like '%' || r.old_name || '%';

    update public.chests set pool = replace(pool::text, '"' || r.old_name || '"', '"' || r.new_name || '"')::jsonb
    where pool::text like '%"' || r.old_name || '"%';
  end loop;
end $$;

-- An admin /stock still running for the old bag name.
update public.market_stock_overrides set pack_name = 'YouTube Bag' where pack_name = 'BlookTuber Bag';

commit;
