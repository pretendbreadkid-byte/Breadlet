begin;

lock table public.profiles in share row exclusive mode;

insert into public.blooks (name, rarity, artwork_key, retired)
values
  ('Space Goo', 'Uncommon', 'space goo (1).svg', false),
  ('Skeleton Pirate', 'Legendary', 'Skeleton pirate frame 1.svg', false),
  ('Festive Skeleton Pirate', 'Mythic', 'feative Skeleton pirate .svg', false)
on conflict (name) do update
set rarity = excluded.rarity,
    artwork_key = excluded.artwork_key,
    retired = excluded.retired;

with replacements as (
  select old_blook.id as old_id, replacement.id as new_id
  from public.blooks as old_blook
  cross join public.blooks as replacement
  where old_blook.name = 'Space Trooper'
    and replacement.name = 'Space Goo'
)
insert into public.inventory (profile_id, blook_id, quantity, shiny, retired)
select inventory.profile_id, replacements.new_id, inventory.quantity, inventory.shiny, false
from public.inventory as inventory
join replacements on replacements.old_id = inventory.blook_id
where inventory.quantity > 0
on conflict (profile_id, blook_id, shiny) do update
set quantity = public.inventory.quantity + excluded.quantity,
    retired = false;

insert into public.notifications (profile_id, type, payload)
select distinct profile.id,
       'blook_replacement',
       jsonb_build_object(
         'title', 'Space Trooper replaced',
         'message', 'Your Space Trooper has been replaced with Space Goo. Your existing copies are in your collection.'
       )
from public.profiles as profile
where profile.equipped_blook_id = (select id from public.blooks where name = 'Space Trooper')
   or exists (
     select 1
     from public.inventory
     where inventory.profile_id = profile.id
       and inventory.blook_id = (select id from public.blooks where name = 'Space Trooper')
       and inventory.quantity > 0
   );

update public.profiles
set equipped_blook_id = (select id from public.blooks where name = 'Space Goo')
where equipped_blook_id = (select id from public.blooks where name = 'Space Trooper');

update public.marketplace_listings
set blook_id = (select id from public.blooks where name = 'Space Goo')
where blook_id = (select id from public.blooks where name = 'Space Trooper')
  and status = 'active';

update public.chests as chest
set pool = (
  select jsonb_agg(
    case
      when reward.value = to_jsonb('Space Trooper'::text) then to_jsonb('Space Goo'::text)
      else reward.value
    end
    order by reward.ordinality
  )
  from jsonb_array_elements(chest.pool) with ordinality as reward(value, ordinality)
)
where chest.pool @> jsonb_build_array('Space Trooper');

delete from public.inventory
where blook_id = (select id from public.blooks where name = 'Space Trooper');

update public.blooks
set retired = true
where name = 'Space Trooper';

create table if not exists public.spooky_contest_prizes (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  placement integer not null unique check (placement between 1 and 30),
  candy_count integer not null check (candy_count > 0),
  reward_blook_id uuid not null references public.blooks(id),
  awarded_at timestamptz not null default now()
);

alter table public.spooky_contest_prizes enable row level security;
revoke all on public.spooky_contest_prizes from public, anon, authenticated;

update public.events
set active = false,
    end_at = case
      when end_at > transaction_timestamp()
        then greatest(start_at + interval '1 second', transaction_timestamp())
      else end_at
    end
where name ilike '%spooky%';

with ranked_players as (
  select profile.id as profile_id,
         (profile.stats->>'candy')::integer as candy_count,
         row_number() over (
           order by (profile.stats->>'candy')::integer desc,
                    profile.created_at asc,
                    profile.id asc
         ) as placement
  from public.profiles as profile
  where coalesce((profile.stats->>'candy')::integer, 0) > 0
),
new_awards as (
  insert into public.spooky_contest_prizes (profile_id, placement, candy_count, reward_blook_id)
  select ranked.profile_id,
         ranked.placement::integer,
         ranked.candy_count,
         case
           when ranked.placement <= 3 then festive.id
           else pirate.id
         end
  from ranked_players as ranked
  cross join public.blooks as pirate
  cross join public.blooks as festive
  where ranked.placement <= 30
    and pirate.name = 'Skeleton Pirate'
    and festive.name = 'Festive Skeleton Pirate'
  on conflict do nothing
  returning profile_id, placement, candy_count, reward_blook_id
),
inventory_awards as (
  insert into public.inventory (profile_id, blook_id, quantity, shiny, retired)
  select profile_id, reward_blook_id, 1, false, false
  from new_awards
  on conflict (profile_id, blook_id, shiny) do update
  set quantity = public.inventory.quantity + excluded.quantity,
      retired = false
  returning profile_id
)
insert into public.notifications (profile_id, type, payload)
select award.profile_id,
       'spooky_contest_prize',
       jsonb_build_object(
         'title', 'Contest of Spooky results',
         'message', format(
           'You placed #%s with %s Candy and received %s.',
           award.placement,
           award.candy_count,
           reward.name
         )
       )
from new_awards as award
join public.blooks as reward on reward.id = award.reward_blook_id;

do $$
begin
  if to_regprocedure('public.apply_gameplay_action_before_spooky_close(uuid,integer,text,integer,jsonb,jsonb,integer,integer)') is null then
    alter function public.apply_gameplay_action(uuid, integer, text, integer, jsonb, jsonb, integer, integer)
      rename to apply_gameplay_action_before_spooky_close;
  end if;
end;
$$;

revoke all on function public.apply_gameplay_action_before_spooky_close(uuid, integer, text, integer, jsonb, jsonb, integer, integer)
  from public, anon, authenticated, service_role;

create or replace function public.apply_gameplay_action(
  p_profile_id uuid,
  p_revision integer,
  p_action text,
  p_token_delta integer,
  p_inventory_delta jsonb,
  p_material_delta jsonb,
  p_candy_delta integer,
  p_capsules_opened integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Server gameplay access is required.';
  end if;
  if coalesce(p_candy_delta, 0) <> 0 then
    raise exception 'The Contest of Spooky has ended.';
  end if;
  begin
    perform public.apply_gameplay_action_before_spooky_close(
      p_profile_id,
      p_revision,
      p_action,
      p_token_delta,
      p_inventory_delta,
      p_material_delta,
      p_candy_delta,
      p_capsules_opened
    );
  exception
    when raise_exception then
      if sqlerrm = 'You already opened today''s Daily Crate.' then
        raise exception 'You already claimed tokens today.';
      end if;
      raise;
  end;
end;
$$;

revoke all on function public.apply_gameplay_action(uuid, integer, text, integer, jsonb, jsonb, integer, integer)
  from public, anon, authenticated;
grant execute on function public.apply_gameplay_action(uuid, integer, text, integer, jsonb, jsonb, integer, integer)
  to service_role;

create or replace function public.award_trade_candy(p_trade_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Server event access is required.';
  end if;
end;
$$;

revoke all on function public.award_trade_candy(uuid) from public, anon, authenticated;
grant execute on function public.award_trade_candy(uuid) to service_role;

commit;
