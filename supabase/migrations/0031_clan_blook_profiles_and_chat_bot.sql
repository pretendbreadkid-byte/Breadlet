begin;

alter table public.clans
  add column if not exists profile_blook text;

drop function if exists public.create_clan_with_cost(text, text, text[], text);

create or replace function public.create_clan_with_cost(
  p_name text,
  p_description text,
  p_tags text[],
  p_thumbnail_url text,
  p_profile_blook text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  creator_id uuid := auth.uid();
  available_tokens integer;
  created_clan public.clans;
  selected_blook text := trim(coalesce(p_profile_blook, ''));
begin
  if creator_id is null then
    raise exception 'Sign in to create a clan.';
  end if;
  if length(trim(coalesce(p_name, ''))) < 2 then
    raise exception 'Clan name must be at least 2 characters.';
  end if;
  if coalesce(array_length(p_tags, 1), 0) > 3 then
    raise exception 'A clan can have at most 3 tags.';
  end if;
  if selected_blook = '' or not exists (
    select 1 from public.blooks where name = selected_blook
  ) then
    raise exception 'Choose a valid Blook for your clan profile.';
  end if;
  if exists (select 1 from public.clan_members where profile_id = creator_id) then
    raise exception 'You are already in a clan.';
  end if;

  select tokens into available_tokens
  from public.profiles
  where id = creator_id
  for update;

  if available_tokens is null or available_tokens < 5000 then
    raise exception 'Creating a clan requires 5,000 tokens.';
  end if;

  insert into public.clans (
    name, description, tags, owner_profile_id, treasury, member_count,
    thumbnail_url, profile_blook
  )
  values (
    left(trim(p_name), 30),
    nullif(left(trim(coalesce(p_description, '')), 200), ''),
    coalesce(p_tags, '{}'::text[]),
    creator_id,
    0,
    1,
    nullif(p_thumbnail_url, ''),
    selected_blook
  )
  returning * into created_clan;

  insert into public.clan_members (clan_id, profile_id, role, token_contributions)
  values (created_clan.id, creator_id, 'leader', 0);

  update public.profiles
  set tokens = available_tokens - 5000
  where id = creator_id;

  return jsonb_build_object('ok', true, 'clan', to_jsonb(created_clan));
end;
$$;

revoke all on function public.create_clan_with_cost(text, text, text[], text, text) from public, anon;
grant execute on function public.create_clan_with_cost(text, text, text[], text, text) to authenticated;

alter table public.global_chat_messages
  add column if not exists is_breadlet_bot boolean not null default false;

create table if not exists public.global_chat_bot_cadence (
  id integer primary key check (id = 1),
  human_message_count bigint not null check (human_message_count >= 0)
);

insert into public.global_chat_bot_cadence (id, human_message_count)
select 1, count(*) from public.global_chat_messages where not is_breadlet_bot
on conflict (id) do nothing;

alter table public.global_chat_bot_cadence enable row level security;

create or replace function public.post_breadlet_chat_fact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  message_count bigint;
  facts text[] := array[
    'A clan can grow to 100 members by unlocking capacity upgrades.',
    'Clan owners can review join requests from their clan page.',
    'You need to leave your current clan before requesting to join another.',
    'A clan banner can be uploaded after its owner unlocks the banner upgrade.',
    'Clan contributions help fund upgrades from the shared treasury.',
    'The Token Bank tracks your recorded token spending.',
    'Every Blook has its own rarity and artwork in the collection.',
    'Animated Blooks use their first artwork frame as a still clan profile.',
    'You can browse clans with Discover even when you are already in one.',
    'Breadlet chat supports replies to earlier messages.',
    'Clan profile Blooks are picked from the Blook collection when the clan is created.',
    'Owners can unlock extra member spaces for their clan.',
    'The Breadlet color theme is the default clan theme.',
    'Players can contribute tokens to their clan treasury.',
    'A clan profile can show any Blook available in the collection.'
  ];
begin
  if new.is_breadlet_bot then
    return new;
  end if;

  update public.global_chat_bot_cadence
  set human_message_count = human_message_count + 1
  where id = 1
  returning human_message_count into message_count;

  if message_count % 20 = 0 then
    perform set_config('app.breadlet_bot_insert', 'true', true);
    insert into public.global_chat_messages (profile_id, message, is_breadlet_bot, created_at)
    values (
      new.profile_id,
      facts[1 + floor(random() * array_length(facts, 1))::integer],
      true,
      clock_timestamp()
    );
    perform set_config('app.breadlet_bot_insert', 'false', true);
  end if;

  return new;
end;
$$;

create or replace function public.protect_breadlet_bot_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('app.breadlet_bot_insert', true), '') <> 'true' then
    new.is_breadlet_bot := false;
  end if;
  return new;
end;
$$;

drop trigger if exists global_chat_protect_breadlet_bot_identity on public.global_chat_messages;
create trigger global_chat_protect_breadlet_bot_identity
before insert on public.global_chat_messages
for each row execute function public.protect_breadlet_bot_identity();

drop trigger if exists global_chat_breadlet_fact_after_insert on public.global_chat_messages;
create trigger global_chat_breadlet_fact_after_insert
after insert on public.global_chat_messages
for each row execute function public.post_breadlet_chat_fact();

notify pgrst, 'reload schema';

commit;
