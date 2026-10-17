begin;

alter table public.clans
  add column if not exists member_capacity integer not null default 25,
  add column if not exists name_change_unlocked boolean not null default false,
  add column if not exists banner_unlocked boolean not null default false,
  add column if not exists banner_data text,
  add column if not exists colors_unlocked boolean not null default false,
  add column if not exists theme text not null default 'breadlet',
  add column if not exists animated_profiles boolean not null default false;

alter table public.clans drop constraint if exists clans_member_count_check;
alter table public.clans drop constraint if exists clans_member_capacity_check;
alter table public.clans drop constraint if exists clans_theme_check;
alter table public.clans
  add constraint clans_member_count_check check (member_count between 1 and 100),
  add constraint clans_member_capacity_check check (member_capacity between 25 and 100),
  add constraint clans_theme_check check (theme in ('breadlet', 'ocean', 'sunset', 'forest', 'royal', 'ember'));

create table if not exists public.clan_join_requests (
  id uuid primary key default gen_random_uuid(),
  clan_id uuid not null references public.clans(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (clan_id, profile_id)
);
create index if not exists clan_join_requests_clan_status_idx on public.clan_join_requests (clan_id, status, created_at);
create index if not exists clan_join_requests_profile_status_idx on public.clan_join_requests (profile_id, status, created_at desc);
alter table public.clan_join_requests enable row level security;

create table if not exists public.token_spending_summary (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  historical_estimate bigint not null default 0 check (historical_estimate >= 0),
  tracked_spent bigint not null default 0 check (tracked_spent >= 0),
  updated_at timestamptz not null default now()
);
alter table public.token_spending_summary enable row level security;
drop policy if exists token_spending_summary_owner_read on public.token_spending_summary;
create policy token_spending_summary_owner_read on public.token_spending_summary
  for select to authenticated using (profile_id = auth.uid());

insert into public.token_spending_summary (profile_id, historical_estimate, tracked_spent)
select p.id,
  greatest(
    coalesce(ledger.amount, 0),
    coalesce(rolls.amount, 0) + coalesce(contributions.amount, 0)
  ),
  0
from public.profiles p
left join (
  select profile_id, sum(-delta)::bigint as amount
  from public.token_transactions
  where delta < 0
  group by profile_id
) ledger on ledger.profile_id = p.id
left join (
  select profile_id, sum(tokens_spent)::bigint as amount
  from public.chest_rolls
  group by profile_id
) rolls on rolls.profile_id = p.id
left join (
  select profile_id, sum(token_contributions)::bigint as amount
  from public.clan_members
  group by profile_id
) contributions on contributions.profile_id = p.id
on conflict (profile_id) do nothing;

create or replace function public.track_token_spending_summary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.delta < 0 then
    insert into public.token_spending_summary (profile_id, tracked_spent, updated_at)
    values (new.profile_id, -new.delta, now())
    on conflict (profile_id) do update
      set tracked_spent = public.token_spending_summary.tracked_spent + excluded.tracked_spent,
          updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists token_spending_summary_after_transaction on public.token_transactions;
create trigger token_spending_summary_after_transaction
after insert on public.token_transactions
for each row execute function public.track_token_spending_summary();

create or replace function public.record_profile_token_decrease()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tokens < old.tokens then
    insert into public.token_transactions (profile_id, type, delta, reason)
    values (new.id, 'spend', new.tokens - old.tokens, 'Token balance decrease');
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_track_token_decrease on public.profiles;
create trigger profiles_track_token_decrease
after update of tokens on public.profiles
for each row execute function public.record_profile_token_decrease();

create or replace function public.secure_clan_upgrade(
  p_profile_id uuid,
  p_clan_id uuid,
  p_feature text,
  p_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.clans%rowtype;
  price integer;
  next_capacity integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Server clan access is required.'; end if;
  select * into target from public.clans where id = p_clan_id for update;
  if not found then raise exception 'Clan not found.'; end if;
  if target.owner_profile_id <> p_profile_id then raise exception 'Only the clan owner can manage upgrades.'; end if;

  if p_feature = 'rename_unlock' then
    if target.name_change_unlocked then raise exception 'Clan renaming is already unlocked.'; end if;
    price := 5000;
    if target.treasury < price then raise exception 'The clan treasury needs 5,000 tokens.'; end if;
    update public.clans set treasury = treasury - price, name_change_unlocked = true where id = p_clan_id returning * into target;
  elsif p_feature = 'banner_unlock' then
    if target.banner_unlocked then raise exception 'The clan banner is already unlocked.'; end if;
    price := 10000;
    if target.treasury < price then raise exception 'The clan treasury needs 10,000 tokens.'; end if;
    update public.clans set treasury = treasury - price, banner_unlocked = true where id = p_clan_id returning * into target;
  elsif p_feature = 'colors_unlock' then
    if target.colors_unlocked then raise exception 'Clan colors are already unlocked.'; end if;
    price := 15000;
    if target.treasury < price then raise exception 'The clan treasury needs 15,000 tokens.'; end if;
    update public.clans set treasury = treasury - price, colors_unlocked = true where id = p_clan_id returning * into target;
  elsif p_feature = 'member_capacity' then
    if target.member_capacity >= 100 then raise exception 'The clan has reached the 100-member limit.'; end if;
    price := 20000;
    if target.treasury < price then raise exception 'The clan treasury needs 20,000 tokens.'; end if;
    next_capacity := least(100, target.member_capacity + 5);
    update public.clans set treasury = treasury - price, member_capacity = next_capacity where id = p_clan_id returning * into target;
  elsif p_feature = 'animated_profiles' then
    if target.animated_profiles then raise exception 'Animated clan profiles are already unlocked.'; end if;
    price := 30000;
    if target.treasury < price then raise exception 'The clan treasury needs 30,000 tokens.'; end if;
    update public.clans set treasury = treasury - price, animated_profiles = true where id = p_clan_id returning * into target;
  elsif p_feature = 'rename' then
    if not target.name_change_unlocked then raise exception 'Unlock clan renaming first.'; end if;
    if length(trim(coalesce(p_value, ''))) < 2 or length(trim(p_value)) > 30 then raise exception 'Clan names must be 2 to 30 characters.'; end if;
    update public.clans set name = trim(p_value) where id = p_clan_id returning * into target;
  elsif p_feature = 'theme' then
    if not target.colors_unlocked then raise exception 'Unlock clan colors first.'; end if;
    if p_value is null or p_value not in ('breadlet', 'ocean', 'sunset', 'forest', 'royal', 'ember') then raise exception 'Choose a valid clan color theme.'; end if;
    update public.clans set theme = p_value where id = p_clan_id returning * into target;
  else
    raise exception 'Unknown clan upgrade.';
  end if;

  return jsonb_build_object('ok', true, 'clan', to_jsonb(target), 'price', coalesce(price, 0));
end;
$$;
revoke all on function public.secure_clan_upgrade(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.secure_clan_upgrade(uuid, uuid, text, text) to service_role;

create or replace function public.secure_clan_join_request(
  p_profile_id uuid,
  p_clan_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  request_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Server clan access is required.'; end if;
  perform id from public.profiles where id = p_profile_id for update;
  if not found then raise exception 'Player not found.'; end if;
  if exists (select 1 from public.clan_members where profile_id = p_profile_id) then
    raise exception 'Leave your current clan before requesting to join another.';
  end if;
  if not exists (select 1 from public.clans where id = p_clan_id) then raise exception 'Clan not found.'; end if;
  insert into public.clan_join_requests (clan_id, profile_id)
  values (p_clan_id, p_profile_id)
  on conflict (clan_id, profile_id) do update
    set status = 'pending', created_at = now(), reviewed_at = null
  where public.clan_join_requests.status in ('declined', 'approved')
  returning id into request_id;
  if request_id is null then raise exception 'You already have a pending or approved request for this clan.'; end if;
  return request_id;
end;
$$;
revoke all on function public.secure_clan_join_request(uuid, uuid) from public, anon, authenticated;
grant execute on function public.secure_clan_join_request(uuid, uuid) to service_role;

create or replace function public.secure_clan_review_join_request(
  p_owner_profile_id uuid,
  p_request_id uuid,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.clan_join_requests%rowtype;
  target public.clans%rowtype;
  applicant public.profiles%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Server clan access is required.'; end if;
  if p_decision not in ('approved', 'declined') then raise exception 'Choose approve or decline.'; end if;
  select * into request_row from public.clan_join_requests where id = p_request_id for update;
  if not found or request_row.status <> 'pending' then raise exception 'This clan request is no longer pending.'; end if;
  select * into target from public.clans where id = request_row.clan_id for update;
  if not found or target.owner_profile_id <> p_owner_profile_id then raise exception 'Only the clan owner can review requests.'; end if;

  if p_decision = 'declined' then
    update public.clan_join_requests set status = 'declined', reviewed_at = now() where id = request_row.id;
    return jsonb_build_object('ok', true, 'status', 'declined');
  end if;

  select * into applicant from public.profiles where id = request_row.profile_id for update;
  if not found then raise exception 'Player not found.'; end if;
  if exists (select 1 from public.clan_members where profile_id = request_row.profile_id) then
    raise exception 'This player already belongs to a clan.';
  end if;
  if target.member_count >= target.member_capacity then raise exception 'This clan is full.'; end if;

  insert into public.clan_members (clan_id, profile_id, role, token_contributions)
  values (target.id, applicant.id, 'member', 0);
  update public.clans set member_count = member_count + 1 where id = target.id returning * into target;
  update public.profiles set stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object('clanTag', left(upper(target.name), 5))
  where id = applicant.id;
  update public.clan_join_requests set status = 'approved', reviewed_at = now() where id = request_row.id;
  update public.clan_join_requests set status = 'declined', reviewed_at = now()
    where profile_id = applicant.id and status = 'pending' and id <> request_row.id;
  return jsonb_build_object('ok', true, 'status', 'approved', 'clan', to_jsonb(target));
end;
$$;
revoke all on function public.secure_clan_review_join_request(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.secure_clan_review_join_request(uuid, uuid, text) to service_role;

create or replace function public.secure_clan_leave(
  p_profile_id uuid,
  p_clan_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  departing public.clan_members%rowtype;
  target public.clans%rowtype;
  next_member public.clan_members%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Server clan access is required.'; end if;
  select * into target from public.clans where id = p_clan_id for update;
  if not found then raise exception 'Clan not found.'; end if;
  select * into departing from public.clan_members
    where profile_id = p_profile_id and clan_id = p_clan_id for update;
  if not found then raise exception 'You are not a member of that clan.'; end if;

  if departing.role = 'leader' then
    select * into next_member from public.clan_members
      where clan_id = p_clan_id and profile_id <> p_profile_id
      order by joined_at, id
      limit 1
      for update;
  end if;

  delete from public.clan_members where id = departing.id;
  if next_member.id is not null then
    update public.clan_members set role = 'leader' where id = next_member.id;
    update public.clans set owner_profile_id = next_member.profile_id,
      member_count = greatest(1, target.member_count - 1) where id = p_clan_id;
  elsif exists (select 1 from public.clan_members where clan_id = p_clan_id) then
    update public.clans set member_count = greatest(1, target.member_count - 1) where id = p_clan_id;
  else
    delete from public.clans where id = p_clan_id;
  end if;

  update public.profiles
    set stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object('clanTag', '')
    where id = p_profile_id;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.secure_clan_leave(uuid, uuid) from public, anon, authenticated;
grant execute on function public.secure_clan_leave(uuid, uuid) to service_role;

commit;
