-- Nunchucks become the Tank (same Epic Breadlet in the Combat Bag, new art). Renaming the row keeps
-- everyone's copies, listings and trades, since those point at the Breadlet's id.
update public.blooks set name = 'Tank' where name = 'Nunchucks';

-- The Combat Bag's pool, and anyone who locked or wishlisted Nunchucks.
update public.chests set pool = replace(pool::text, '"Nunchucks"', '"Tank"')::jsonb where pool::text like '%"Nunchucks"%';
update public.profiles set stats = replace(stats::text, '"Nunchucks"', '"Tank"')::jsonb where stats::text like '%"Nunchucks"%';

notify pgrst, 'reload schema';
