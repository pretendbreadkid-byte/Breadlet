-- "Admin abuse" live events: the owner starts an event and every online player sees it.
-- Only the server (service role) can create events, so players can't fake them; players
-- just read them, live through Realtime.

create table if not exists public.admin_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('disco', 'barrel_roll', 'announcement', 'bread_rain')),
  message text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  ends_at timestamptz not null
);
create index if not exists admin_events_ends_idx on public.admin_events (ends_at desc);

-- How many breads each player caught in each Bread Rain (reward is capped per player).
create table if not exists public.admin_event_catches (
  event_id uuid not null references public.admin_events(id) on delete cascade,
  profile_id uuid not null references auth.users(id) on delete cascade,
  catches integer not null default 0,
  primary key (event_id, profile_id)
);

alter table public.admin_events enable row level security;
alter table public.admin_event_catches enable row level security;
revoke insert, update, delete on public.admin_events from anon, authenticated;
revoke all on public.admin_event_catches from anon, authenticated;
drop policy if exists admin_events_read on public.admin_events;
create policy admin_events_read on public.admin_events for select to authenticated using (true);
grant select on public.admin_events to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'admin_events') then
    alter publication supabase_realtime add table public.admin_events;
  end if;
end $$;

-- Catch one bread: +10 Bread Bucks, at most 5 per player per rain, only while it's raining.
create or replace function public.catch_admin_event_bread(p_event_id uuid, p_profile_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  event_row public.admin_events%rowtype;
  caught integer;
begin
  select * into event_row from public.admin_events where id = p_event_id;
  if not found or event_row.kind <> 'bread_rain' or event_row.ends_at < now() then
    raise exception 'The bread rain is over.';
  end if;

  insert into public.admin_event_catches (event_id, profile_id, catches)
  values (p_event_id, p_profile_id, 1)
  on conflict (event_id, profile_id) do update
    set catches = admin_event_catches.catches + 1
    where admin_event_catches.catches < 5
  returning catches into caught;

  if caught is null then
    raise exception 'You caught the most breads you can this rain.';
  end if;

  update public.profiles set tokens = tokens + 10 where id = p_profile_id;
  return caught;
end;
$$;

revoke all on function public.catch_admin_event_bread(uuid, uuid) from public, anon, authenticated;
grant execute on function public.catch_admin_event_bread(uuid, uuid) to service_role;
