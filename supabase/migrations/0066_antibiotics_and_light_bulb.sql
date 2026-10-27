-- Inventions Bag: Da Vinci's Ornithopter becomes Antibiotics and Leonardo da Vinci's Tank becomes
-- Light Bulb. Renaming keeps the same blook ids, so everyone who owns one keeps it.
update public.blooks set name = 'Antibiotics', artwork_key = 'antibiotics.svg' where name = 'Da Vinci''s Ornithopter';
update public.blooks set name = 'Light Bulb', artwork_key = 'light-bulb.svg' where name = 'Leonardo da Vinci''s Tank';
