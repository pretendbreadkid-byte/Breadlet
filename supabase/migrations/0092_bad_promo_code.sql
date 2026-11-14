-- Promo code BAD: 500 tokens, once per account.
create or replace function public.secure_bad_promo(p_profile_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare player public.profiles%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Server promo access is required.'; end if;
  select * into player from public.profiles where id = p_profile_id for update;
  if not found or player.is_banned or player.account_status <> 'active' then raise exception 'Account unavailable.'; end if;
  if coalesce((player.stats->>'badPromoRedeemed')::boolean, false) then raise exception 'You already redeemed this promo code.'; end if;
  update public.profiles set tokens = tokens + 500,
    stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object('badPromoRedeemed', true, 'gameplayRevision', coalesce((stats->>'gameplayRevision')::integer, 0) + 1)
    where id = p_profile_id;
end;
$$;
revoke all on function public.secure_bad_promo(uuid) from public, anon, authenticated;
grant execute on function public.secure_bad_promo(uuid) to service_role;

-- New art for Egg, Carrot, Potato and Avocado.
update public.blooks set artwork_key = 'egg-3.webp' where name = 'Egg';
update public.blooks set artwork_key = 'carrot-3.webp' where name = 'Carrot';
update public.blooks set artwork_key = 'potato-3.webp' where name = 'Potato';
update public.blooks set artwork_key = 'avocado-3.svg' where name = 'Avocado';
