-- How many of each Breadlet exist: every copy in players' inventories plus copies held in
-- active Bazaar listings. Shiny copies are counted separately as "Shiny <name>".
create or replace function public.blook_exist_counts()
returns table (name text, total bigint)
language sql
stable
security definer
set search_path = public
as $$
  select case when c.shiny then 'Shiny ' || b.name else b.name end as name, sum(c.quantity)::bigint as total
  from (
    select blook_id, shiny, quantity from public.inventory where quantity > 0
    union all
    select blook_id, coalesce(shiny, false), greatest(quantity, 1) from public.marketplace_listings
      where status = 'active' and escrowed
  ) c
  join public.blooks b on b.id = c.blook_id
  group by 1;
$$;

revoke all on function public.blook_exist_counts() from public, anon, authenticated;
grant execute on function public.blook_exist_counts() to service_role;
