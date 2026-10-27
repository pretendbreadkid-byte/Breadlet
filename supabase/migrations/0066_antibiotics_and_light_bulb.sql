-- Inventions Bag: Da Vinci's Ornithopter becomes Antibiotics and Leonardo da Vinci's Tank becomes
-- Light Bulb. Renaming keeps the same blook ids, so everyone who owns one keeps it as the new one.
update public.blooks set name = 'Antibiotics', artwork_key = 'antibiotics.svg' where name = 'Da Vinci''s Ornithopter';
update public.blooks set name = 'Light Bulb', artwork_key = 'light-bulb.svg' where name = 'Leonardo da Vinci''s Tank';

-- Locked Breadlets and Bazaar wishlists are saved by name, so rename them there too.
update public.profiles set stats = jsonb_set(stats, '{lockedBlooks}', (
  select coalesce(jsonb_agg(case item when 'Da Vinci''s Ornithopter' then 'Antibiotics' when 'Leonardo da Vinci''s Tank' then 'Light Bulb' else item end), '[]'::jsonb)
  from jsonb_array_elements_text(stats -> 'lockedBlooks') as item
))
where jsonb_typeof(stats -> 'lockedBlooks') = 'array' and stats -> 'lockedBlooks' ?| array['Da Vinci''s Ornithopter', 'Leonardo da Vinci''s Tank'];
update public.profiles set stats = jsonb_set(stats, '{wishlist}', (
  select coalesce(jsonb_agg(case item when 'Da Vinci''s Ornithopter' then 'Antibiotics' when 'Leonardo da Vinci''s Tank' then 'Light Bulb' else item end), '[]'::jsonb)
  from jsonb_array_elements_text(stats -> 'wishlist') as item
))
where jsonb_typeof(stats -> 'wishlist') = 'array' and stats -> 'wishlist' ?| array['Da Vinci''s Ornithopter', 'Leonardo da Vinci''s Tank'];
