-- Lets players hide their badges (stats.hideBadges) and block players (stats.blockedPlayers),
-- on top of the locked Breadlets and wishlist the function already saves.
create or replace function public.set_player_pref(p_profile_id uuid, p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Server access is required.';
  end if;
  if not (
    (p_key in ('lockedBlooks', 'wishlist', 'blockedPlayers') and jsonb_typeof(p_value) = 'array')
    or (p_key = 'hideBadges' and jsonb_typeof(p_value) = 'boolean')
  ) then
    raise exception 'Invalid preference.';
  end if;
  update public.profiles set stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object(p_key, p_value) where id = p_profile_id;
end;
$$;

revoke all on function public.set_player_pref(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.set_player_pref(uuid, text, jsonb) to service_role;
