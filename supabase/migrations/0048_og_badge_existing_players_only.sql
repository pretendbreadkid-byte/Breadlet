-- OG is no longer handed out automatically. Existing players keep it as a permanent badge.
update public.profiles
set stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object('badges',
  (select coalesce(jsonb_agg(distinct b), '[]'::jsonb) from (
    select jsonb_array_elements_text(coalesce(stats->'badges', '[]'::jsonb)) as b
    union select 'OG'
  ) x));

