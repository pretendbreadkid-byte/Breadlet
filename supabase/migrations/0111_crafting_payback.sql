-- Crafting was removed, so leftover crafting materials (Flower, Cloth, Metal, Sugar, Gold, Gem...)
-- became useless. Pay a small amount of Garden Tokens for them, then clear the materials so this
-- can't pay twice if it's run again.
--   1 Garden Token per 5 materials (Gold and Gem count 3 each), at least 5, at most 100.
-- Only adds to gardenTokens (spendable), not gardenTokensTotal; the garden leaderboard ranks by
-- max(total, current), so the payback does show there. Each player gets a pop-up.
with weighted as (
  select p.id as profile_id,
         sum(case when m.key in ('Gold', 'Gem') then 3 else 1 end * m.value::numeric) as amount
  from public.profiles p, jsonb_each_text(coalesce(p.materials, '{}'::jsonb)) m
  where m.value ~ '^[0-9]+$'
  group by p.id
  having sum(m.value::numeric) > 0
), payback as (
  select profile_id, least(100, greatest(5, ceil(amount / 5)))::int as tokens from weighted
), existing as (
  update public.breadlet_fields f
  set state = jsonb_set(coalesce(f.state, '{}'::jsonb), '{gardenTokens}',
                to_jsonb(coalesce((f.state->>'gardenTokens')::int, 0) + pb.tokens)),
      rev = f.rev + 1,
      updated_at = now()
  from payback pb
  where f.profile_id = pb.profile_id
  returning f.profile_id
), fresh as (
  insert into public.breadlet_fields (profile_id, state, rev)
  select pb.profile_id, jsonb_build_object('gardenTokens', pb.tokens), 1
  from payback pb
  where not exists (select 1 from public.breadlet_fields f where f.profile_id = pb.profile_id)
  returning profile_id
), cleared as (
  update public.profiles p set materials = '{}'::jsonb
  from payback pb where p.id = pb.profile_id
  returning p.id
), notified as (
  insert into public.notifications (profile_id, type, payload)
  select pb.profile_id, 'admin_gift', jsonb_build_object(
    'title', 'Crafting payback',
    'message', 'Crafting has been removed, so your leftover crafting materials were swapped for '
               || pb.tokens || ' Garden Tokens. Spend them on props in your garden!'
  ) from payback pb
  returning profile_id
)
select (select count(*) from payback) as players_paid,
       (select sum(tokens) from payback) as tokens_given,
       (select count(*) from existing) as gardens_updated,
       (select count(*) from fresh) as gardens_created,
       (select count(*) from cleared) as materials_cleared;
