begin;

insert into public.blooks (name, rarity, artwork_key, retired) values
  ('Twisted Bread', 'Uncommon', 'twisted-bread-blooktuber.png', false),
  ('SRN', 'Uncommon', 'srn-blooktuber.png', false),
  ('Blook Master', 'Legendary', 'blook-master.png', false),
  ('Turtwix', 'Rare', 'turtwix.png', false),
  ('Green Astronaut', 'Uncommon', 'green-astronaut-blooktuber.png', false)
on conflict (name) do update
set rarity = excluded.rarity,
    artwork_key = excluded.artwork_key,
    retired = excluded.retired;

update public.chests
set pool = pool || '["Twisted Bread"]'::jsonb
where name = 'BlookTuber Bag'
  and not (pool @> '["Twisted Bread"]'::jsonb);

update public.chests
set pool = pool || '["SRN"]'::jsonb
where name = 'BlookTuber Bag'
  and not (pool @> '["SRN"]'::jsonb);

update public.chests
set pool = pool || '["Blook Master"]'::jsonb
where name = 'BlookTuber Bag'
  and not (pool @> '["Blook Master"]'::jsonb);

update public.chests
set pool = pool || '["Turtwix"]'::jsonb
where name = 'BlookTuber Bag'
  and not (pool @> '["Turtwix"]'::jsonb);

update public.chests
set pool = pool || '["Green Astronaut"]'::jsonb
where name = 'BlookTuber Bag'
  and not (pool @> '["Green Astronaut"]'::jsonb);

commit;
