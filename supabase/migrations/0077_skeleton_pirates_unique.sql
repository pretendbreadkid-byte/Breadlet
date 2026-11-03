-- The Skeleton Pirates become Unique. Only Ted and Walter White can't be traded (that check is in
-- the server code), so Unique Breadlets like these can still be sold, listed and traded.

update public.blooks set rarity = 'Unique' where name in ('Skeleton Pirate', 'Festive Skeleton Pirate');
