begin;

do $$
begin
  if exists (
    select 1
    from (values
      ('Burnt Toast', 'Toaster'),
      ('Brioche', 'Croissant'),
      ('Donut', 'Cinnamon Roll')
    ) as replacements(old_name, new_name)
    join public.blooks as old_blook on old_blook.name = replacements.old_name
    join public.blooks as replacement on replacement.name = replacements.new_name
    where old_blook.rarity <> replacement.rarity
  ) then
    raise exception 'Bread Bag replacements must retain the original rarity.';
  end if;
end;
$$;

with replacements (old_name, new_name) as (
  values
    ('Burnt Toast', 'Toaster'),
    ('Brioche', 'Croissant'),
    ('Donut', 'Cinnamon Roll')
)
insert into public.inventory (profile_id, blook_id, quantity, shiny, retired)
select inventory.profile_id, replacement.id, inventory.quantity, inventory.shiny, false
from public.inventory as inventory
join public.blooks as old_blook on old_blook.id = inventory.blook_id
join replacements on replacements.old_name = old_blook.name
join public.blooks as replacement on replacement.name = replacements.new_name
where inventory.quantity > 0
on conflict (profile_id, blook_id, shiny) do update
set quantity = public.inventory.quantity + excluded.quantity,
    retired = false;

with replacements (old_name, new_name) as (
  values
    ('Burnt Toast', 'Toaster'),
    ('Brioche', 'Croissant'),
    ('Donut', 'Cinnamon Roll')
)
update public.marketplace_listings as listing
set blook_id = replacement.id
from public.blooks as old_blook
join replacements on replacements.old_name = old_blook.name
join public.blooks as replacement on replacement.name = replacements.new_name
where listing.blook_id = old_blook.id
  and listing.status = 'active';

with replacements (old_name, new_name) as (
  values
    ('Burnt Toast', 'Toaster'),
    ('Brioche', 'Croissant'),
    ('Donut', 'Cinnamon Roll')
)
update public.profiles as profile
set equipped_blook_id = replacement.id
from public.blooks as old_blook
join replacements on replacements.old_name = old_blook.name
join public.blooks as replacement on replacement.name = replacements.new_name
where profile.equipped_blook_id = old_blook.id;

delete from public.inventory
where blook_id in (
  select id from public.blooks where name in ('Burnt Toast', 'Brioche', 'Donut')
);

update public.blooks
set retired = true
where name in ('Burnt Toast', 'Brioche', 'Donut');

commit;
