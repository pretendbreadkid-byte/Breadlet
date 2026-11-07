begin;

insert into public.blooks (name, rarity, retired)
values ('Crow', 'Uncommon', true)
on conflict (name) do nothing;

alter table public.clans
  add column if not exists crow_reward_enabled boolean not null default false;

update public.clans
  set crow_reward_enabled = true
  where lower(name) = lower('Vespa death');

-- Existing members of the reward clan receive the same Crow as future members.
insert into public.inventory (profile_id, blook_id, quantity, shiny)
select member.profile_id, crow.id, 1, false
from public.clan_members as member
join public.clans as clan on clan.id = member.clan_id and clan.crow_reward_enabled
cross join public.blooks as crow
where crow.name = 'Crow'
on conflict (profile_id, blook_id, shiny)
do update set quantity = public.inventory.quantity + excluded.quantity;

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

  select id into crow_id from public.blooks where name = 'Crow';
  if crow_id is null then raise exception 'The Crow clan reward is missing from the catalog.'; end if;

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

drop trigger if exists clan_members_crow_reward on public.clan_members;
create trigger clan_members_crow_reward
after insert or delete on public.clan_members
for each row execute function public.sync_clan_crow_reward();

create or replace function public.secure_clan_kick_member(
  p_owner_profile_id uuid,
  p_clan_id uuid,
  p_member_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.clans%rowtype;
  departing public.clan_members%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Server clan access is required.'; end if;
  if p_member_profile_id = p_owner_profile_id then raise exception 'The clan owner cannot kick themselves.'; end if;

  select * into target from public.clans where id = p_clan_id for update;
  if not found then raise exception 'Clan not found.'; end if;
  if target.owner_profile_id <> p_owner_profile_id then raise exception 'Only the clan owner can kick members.'; end if;

  select * into departing from public.clan_members
    where clan_id = p_clan_id and profile_id = p_member_profile_id for update;
  if not found then raise exception 'That player is not a member of this clan.'; end if;

  delete from public.clan_members where id = departing.id;
  update public.clans
    set member_count = greatest(1, target.member_count - 1)
    where id = p_clan_id;
  update public.profiles
    set stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object('clanTag', '')
    where id = p_member_profile_id;
  update public.clan_join_requests
    set status = 'declined', reviewed_at = now()
    where profile_id = p_member_profile_id and status = 'pending';

  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.secure_clan_kick_member(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.secure_clan_kick_member(uuid, uuid, uuid) to service_role;

notify pgrst, 'reload schema';

commit;
