-- Bread Bag now costs 30 (odds live in lib/gameplay-catalog.ts).
update public.chests set price = 30 where name = 'Bread Bag';
