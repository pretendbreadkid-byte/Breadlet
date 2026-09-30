alter table public.clans add column if not exists thumbnail_url text;

drop function if exists public.create_clan_with_cost(text, text, text[], text);

create function public.create_clan_with_cost(
  p_name text,
  p_description text,
  p_tags text[],
  p_thumbnail_url text
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

  insert into public.clans (name, description, tags, owner_profile_id, treasury, member_count, thumbnail_url)
  values (
    left(trim(p_name), 30),
    nullif(left(trim(coalesce(p_description, '')), 200), ''),
    coalesce(p_tags, '{}'::text[]),
    creator_id,
    0,
    1,
    nullif(p_thumbnail_url, '')
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

revoke all on function public.create_clan_with_cost(text, text, text[], text) from public, anon;
grant execute on function public.create_clan_with_cost(text, text, text[], text) to authenticated;

notify pgrst, 'reload schema';
