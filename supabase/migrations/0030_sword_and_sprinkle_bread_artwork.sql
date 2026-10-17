begin;

update public.blooks
set artwork_key = 'sword way better.svg'
where name = 'Sword';

insert into public.blooks (name, rarity, artwork_key, retired)
values ('Sprinkle Bread', 'Epic', 'Sprinkle bread improved.svg', false)
on conflict (name) do update
set artwork_key = excluded.artwork_key,
    retired = false;

commit;
