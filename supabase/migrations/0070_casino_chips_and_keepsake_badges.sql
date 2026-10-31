-- Casino chips: bought with Bread Bucks at the Cashier and bet at the tables. Only the server
-- changes them, since players can't write to profiles (0015).
alter table public.profiles add column if not exists chips integer not null default 0 check (chips >= 0);

-- Token milestone badges stay forever once earned, even if the balance drops again.
create or replace function public.with_token_badges(p_stats jsonb, p_balance bigint)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  badges jsonb := coalesce(p_stats->'badges', '[]'::jsonb);
  milestone record;
begin
  for milestone in select * from (values ('10K Tokens', 10000), ('100K Tokens', 100000), ('1M Tokens', 1000000)) as entry(badge, minimum) loop
    if p_balance >= milestone.minimum and not badges ? milestone.badge then
      badges := badges || to_jsonb(milestone.badge);
    end if;
  end loop;
  return coalesce(p_stats, '{}'::jsonb) || jsonb_build_object('badges', badges);
end;
$$;

create or replace function public.keep_token_badges()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.tokens >= 10000 then
    new.stats := public.with_token_badges(new.stats, new.tokens);
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_keep_token_badges on public.profiles;
create trigger profiles_keep_token_badges
before update of tokens on public.profiles
for each row execute function public.keep_token_badges();

-- Hand out what players already earned. A balance isn't logged, but a single spend proves the
-- player held at least that much, so that counts too.
with peaks as (
  select profiles.id, greatest(profiles.tokens::bigint, coalesce(max(-spends.delta), 0)) as peak
  from public.profiles
  left join public.token_transactions spends on spends.profile_id = profiles.id and spends.delta < 0
  group by profiles.id
)
update public.profiles
set stats = public.with_token_badges(profiles.stats, peaks.peak)
from peaks
where peaks.id = profiles.id and peaks.peak >= 10000;

-- These Breadlets are single animated SVGs now instead of frame sets.
update public.blooks set artwork_key = case name
  when 'Alien' then 'alien-animated.svg'
  when 'Caramel Apple' then 'fall/caramel-apple-animated.svg'
  when 'Diamond Sword' then 'diamond-sword-animated.svg'
  when 'Golden Toaster' then 'golden-toaster-animated.svg'
  when 'Lost and Found Box' then 'lost-and-found-box-animated.svg'
  when 'Reindeer' then 'winter/reindeer-animated.svg'
  when 'Gnome' then 'winter/gnome-animated.svg'
  when 'Tanuki' then 'fall/tanuki-animated.svg'
end
where name in ('Alien', 'Caramel Apple', 'Diamond Sword', 'Golden Toaster', 'Lost and Found Box', 'Reindeer', 'Gnome', 'Tanuki');
