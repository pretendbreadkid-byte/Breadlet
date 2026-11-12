-- Disbanding a clan: only its leader can. Everything left in the treasury is split evenly between
-- every member (the leader too); the leader also gets what's left after dividing. Then the clan,
-- its members, chat and join requests are deleted.
create or replace function public.secure_clan_disband(p_profile_id uuid, p_clan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.clans%rowtype;
  member_ids uuid[];
  member_total integer;
  share integer;
  leftover integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Server clan access is required.'; end if;
  select * into target from public.clans where id = p_clan_id for update;
  if not found then raise exception 'Clan not found.'; end if;
  if not exists (select 1 from public.clan_members where clan_id = p_clan_id and profile_id = p_profile_id and role = 'leader')
     and target.owner_profile_id is distinct from p_profile_id then
    raise exception 'Only the clan leader can disband the clan.';
  end if;

  select array_agg(profile_id order by joined_at) into member_ids from public.clan_members where clan_id = p_clan_id;
  member_ids := coalesce(member_ids, array[]::uuid[]);
  if not (p_profile_id = any(member_ids)) then member_ids := member_ids || p_profile_id; end if;
  member_total := cardinality(member_ids);
  share := greatest(coalesce(target.treasury, 0), 0) / member_total;
  leftover := greatest(coalesce(target.treasury, 0), 0) - share * member_total;

  update public.profiles
    set tokens = tokens + share + case when id = p_profile_id then leftover else 0 end,
        stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object('clanTag', '')
    where id = any(member_ids);

  delete from public.clans where id = p_clan_id;

  return jsonb_build_object('ok', true, 'name', target.name, 'treasury', greatest(coalesce(target.treasury, 0), 0),
    'share', share, 'leftover', leftover, 'members', to_jsonb(member_ids));
end;
$$;

revoke all on function public.secure_clan_disband(uuid, uuid) from public, anon, authenticated;
grant execute on function public.secure_clan_disband(uuid, uuid) to service_role;
