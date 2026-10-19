create or replace function public.cancel_marketplace_listing(
  p_profile_id uuid,
  p_listing_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  listing public.marketplace_listings%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Server marketplace access is required.';
  end if;

  select * into listing
  from public.marketplace_listings
  where id = p_listing_id
  for update;
  if not found or listing.status <> 'active' then
    raise exception 'Listing is no longer active.';
  end if;
  if listing.profile_id <> p_profile_id then
    raise exception 'You can only take down your own listings.';
  end if;

  if listing.escrowed then
    insert into public.inventory(profile_id, blook_id, quantity, shiny)
    values (p_profile_id, listing.blook_id, greatest(listing.quantity, 1), listing.shiny)
    on conflict(profile_id, blook_id, shiny)
    do update set quantity = public.inventory.quantity + excluded.quantity;
  end if;

  update public.marketplace_listings
  set status = 'cancelled'
  where id = listing.id;

  update public.profiles
  set stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object(
    'gameplayRevision',
    coalesce((stats->>'gameplayRevision')::integer, 0) + 1
  )
  where id = p_profile_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.cancel_marketplace_listing(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.cancel_marketplace_listing(uuid, uuid)
  to service_role;
