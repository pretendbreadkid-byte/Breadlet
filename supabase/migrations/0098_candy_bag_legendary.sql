-- Candy Bag gets a Legendary: Marshmallow Bunny moves up to Legendary, Chocolate Kiss to Epic.
update public.blooks set rarity = 'Legendary' where name = 'Marshmallow Bunny';
update public.blooks set rarity = 'Epic' where name = 'Chocolate Kiss';
