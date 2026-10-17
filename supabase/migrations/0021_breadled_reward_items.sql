begin;

alter table public.blooks drop constraint if exists blooks_rarity_check;
update public.blooks set rarity = 'Breadled' where rarity = 'Transcendent';
alter table public.blooks
  add constraint blooks_rarity_check
  check (rarity in ('Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Chroma', 'Unique', 'Breadled'));

insert into public.blooks (name, rarity, artwork_key, retired) values
  ('Star Ship', 'Breadled', 'star ship frame 1.svg', false),
  ('Lost and Found Box', 'Breadled', 'Lost and found box frame 1.svg', false),
  ('Golden Toaster', 'Breadled', 'goldenToaster frame 1.svg', false)
on conflict (name) do update
set rarity = excluded.rarity,
    artwork_key = excluded.artwork_key,
    retired = excluded.retired;

update public.chests
set pool = pool || '["Lost and Found Box"]'::jsonb
where name = 'Lost and Found Bag'
  and not (pool @> '["Lost and Found Box"]'::jsonb);

update public.chests
set pool = pool || '["Golden Toaster"]'::jsonb
where name = 'Bread Bag'
  and not (pool @> '["Golden Toaster"]'::jsonb);

commit;
