-- Referral system: every player gets a code; each signup using it gives the owner 500 Bread Bucks
-- (up to 50 referrals). 25 referrals earn the Verified badge, 50 unlock a custom code.
create unique index if not exists profiles_referral_code_unique
  on public.profiles (upper(stats->>'referralCode'))
  where stats ? 'referralCode';

create or replace function public.referral_ensure_code(p_profile_id uuid, p_code text, p_custom boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s jsonb;
  cnt integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Server access is required.';
  end if;
  select coalesce(stats, '{}'::jsonb) into s from public.profiles where id = p_profile_id for update;
  if not found then raise exception 'Player not found.'; end if;
  cnt := coalesce((s->>'referralCount')::integer, 0);
  if p_custom then
    if cnt < 50 then raise exception 'Invite 50 players to unlock a custom code.'; end if;
  elsif s ? 'referralCode' then
    return jsonb_build_object('code', s->>'referralCode', 'count', cnt);
  end if;
  update public.profiles set stats = s || jsonb_build_object('referralCode', upper(p_code)) where id = p_profile_id;
  return jsonb_build_object('code', upper(p_code), 'count', cnt);
end;
$$;

create or replace function public.referral_reward(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  cnt integer;
  badges jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Server access is required.';
  end if;
  select id, tokens, coalesce(stats, '{}'::jsonb) as stats into r
    from public.profiles where upper(stats->>'referralCode') = upper(p_code) for update;
  if not found then return jsonb_build_object('rewarded', false); end if;
  cnt := coalesce((r.stats->>'referralCount')::integer, 0);
  if cnt >= 50 then return jsonb_build_object('rewarded', false); end if;
  cnt := cnt + 1;
  badges := coalesce(r.stats->'badges', '[]'::jsonb);
  if cnt >= 25 and not (badges ? 'Verified') then badges := badges || '["Verified"]'::jsonb; end if;
  update public.profiles
    set tokens = least(2147483647::bigint, tokens::bigint + 500),
        stats = r.stats || jsonb_build_object('referralCount', cnt, 'badges', badges)
    where id = r.id;
  return jsonb_build_object('rewarded', true, 'count', cnt);
end;
$$;

revoke all on function public.referral_ensure_code(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.referral_reward(text) from public, anon, authenticated;
grant execute on function public.referral_ensure_code(uuid, text, boolean) to service_role;
grant execute on function public.referral_reward(text) to service_role;
