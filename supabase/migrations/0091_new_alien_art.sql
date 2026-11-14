-- The Alien gets new art, and the Martian (added in 0090 by mistake, nobody owns one) is removed.
update public.blooks set artwork_key = 'alien.webp' where name = 'Alien';
delete from public.blooks b where b.name = 'Martian'
  and not exists (select 1 from public.inventory i where i.blook_id = b.id)
  and not exists (select 1 from public.marketplace_listings m where m.blook_id = b.id);
