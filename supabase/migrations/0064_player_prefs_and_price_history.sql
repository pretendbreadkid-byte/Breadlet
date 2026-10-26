-- Locked (favorite) Breadlets and the Bazaar wishlist live in profiles.stats. This sets one of
-- them in place, so it can't overwrite other stats (gameplay revision, claims) written at the
-- same moment.
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
  if p_key not in ('lockedBlooks', 'wishlist') or jsonb_typeof(p_value) <> 'array' then
    raise exception 'Invalid preference.';
  end if;
  update public.profiles set stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object(p_key, p_value) where id = p_profile_id;
end;
$$;

revoke all on function public.set_player_pref(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.set_player_pref(uuid, text, jsonb) to service_role;

-- Bazaar price history: the last few sales of a Breadlet.
create index if not exists marketplace_listings_sold_idx on public.marketplace_listings (blook_id, sold_at desc) where status = 'sold';
