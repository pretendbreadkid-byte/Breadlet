-- Fireplace joins the Winter Bag as an Epic.
-- Migration 0080's clan reward never switched on: it looked for a clan named "Vespa death", but the
-- clan is "Vespra Death". It also gave the regular Crow; the clan's reward is the Albino Crow.
-- Joining Vespra Death now gives an Albino Crow, and leaving takes one back (so it can't be farmed).

begin;

-- The Winter Bag's new Epic.
insert into public.blooks (name, rarity, artwork_key) values ('Fireplace', 'Epic', 'winter/fireplace.svg')
on conflict (name) do update set rarity = excluded.rarity, artwork_key = excluded.artwork_key;

update public.clans set crow_reward_enabled = true where lower(name) = 'vespra death';

create or replace function public.sync_clan_crow_reward()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  crow_id uuid;
  member_profile_id uuid;
  reward_enabled boolean;
begin
  select crow_reward_enabled into reward_enabled
    from public.clans
    where id = case when tg_op = 'INSERT' then new.clan_id else old.clan_id end;
  if not coalesce(reward_enabled, false) then
    if tg_op = 'INSERT' then return new; end if;
    return old;
  end if;

  select id into crow_id from public.blooks where name = 'Albino Crow';
  if crow_id is null then raise exception 'The Albino Crow clan reward is missing from the catalog.'; end if;

  if tg_op = 'INSERT' then
    insert into public.inventory (profile_id, blook_id, quantity, shiny)
    values (new.profile_id, crow_id, 1, false)
    on conflict (profile_id, blook_id, shiny)
    do update set quantity = public.inventory.quantity + excluded.quantity;
    return new;
  end if;

  member_profile_id := old.profile_id;
  update public.inventory
    set quantity = quantity - 1
    where profile_id = member_profile_id and blook_id = crow_id and shiny = false and quantity > 0;
  delete from public.inventory
    where profile_id = member_profile_id and blook_id = crow_id and shiny = false and quantity = 0;
  update public.profiles
    set equipped_blook_id = null
    where id = member_profile_id
      and equipped_blook_id = crow_id
      and not exists (
        select 1 from public.inventory
        where profile_id = member_profile_id and blook_id = crow_id and quantity > 0
      );
  return old;
end;
$$;
revoke all on function public.sync_clan_crow_reward() from public, anon, authenticated;

-- Members who joined after the Albino Crows were handed out get theirs now.
insert into public.inventory (profile_id, blook_id, quantity, shiny)
select member.profile_id, crow.id, 1, false
from public.clan_members member
join public.clans clan on clan.id = member.clan_id and clan.crow_reward_enabled
cross join public.blooks crow
where crow.name = 'Albino Crow'
  and not exists (select 1 from public.inventory owned where owned.profile_id = member.profile_id and owned.blook_id = crow.id and owned.shiny = false)
on conflict (profile_id, blook_id, shiny) do nothing;

commit;
