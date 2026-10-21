-- Merge the AdminXD2 and admin accounts into breadblook, reserve those names, and add a shared Bread Bucks bank.
-- The breadblook account keeps its login. Its balance IS the bank balance.
do $$
declare
  target uuid;
  src record;
  fk record;
  merged_tokens bigint;
  merged_materials jsonb;
  merged_badges jsonb;
begin
  select id into target from public.profiles where lower(username) = 'breadblook';
  if target is null then raise exception 'No breadblook account found to merge into.'; end if;

  for src in select id, tokens, materials, stats from public.profiles where lower(username) in ('adminxd2', 'admin') and id <> target loop
    -- Bread Bucks
    update public.profiles set tokens = least(2147483647::bigint, tokens::bigint + src.tokens) where id = target;

    -- Materials (sum per key)
    select coalesce(jsonb_object_agg(k, total), '{}'::jsonb) into merged_materials from (
      select k, sum(v::numeric)::bigint as total from (
        select key as k, value as v from jsonb_each_text((select materials from public.profiles where id = target))
        union all
        select key, value from jsonb_each_text(coalesce(src.materials, '{}'::jsonb))
      ) x group by k
    ) y;
    update public.profiles set materials = merged_materials where id = target;

    -- Badges (union)
    select coalesce(jsonb_agg(distinct b), '[]'::jsonb) into merged_badges from (
      select jsonb_array_elements_text(coalesce((select stats->'badges' from public.profiles where id = target), '[]'::jsonb)) as b
      union
      select jsonb_array_elements_text(coalesce(src.stats->'badges', '[]'::jsonb))
    ) z;
    update public.profiles set stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object('badges', merged_badges) where id = target;

    -- Breadlets (sum per blook and shiny flag)
    insert into public.inventory (profile_id, blook_id, quantity, shiny, retired)
    select target, blook_id, quantity, shiny, retired from public.inventory where profile_id = src.id
    on conflict (profile_id, blook_id, shiny) do update set quantity = public.inventory.quantity + excluded.quantity;
    delete from public.inventory where profile_id = src.id;

    -- Spending totals
    update public.token_spending_summary t set
      historical_estimate = t.historical_estimate + s.historical_estimate,
      tracked_spent = t.tracked_spent + s.tracked_spent
    from public.token_spending_summary s where t.profile_id = target and s.profile_id = src.id;
    delete from public.token_spending_summary where profile_id = src.id;

    -- Everything else that points at the old account moves to breadblook (rows that would clash are dropped).
    for fk in
      select c.conrelid::regclass as tbl, a.attname as col
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.contype = 'f' and c.confrelid = 'public.profiles'::regclass
        and c.conrelid <> 'public.profiles'::regclass and array_length(c.conkey, 1) = 1
    loop
      begin
        execute format('update %s set %I = $1 where %I = $2', fk.tbl, fk.col, fk.col) using target, src.id;
      exception when others then
        execute format('delete from %s where %I = $1', fk.tbl, fk.col) using src.id;
      end;
    end loop;

    delete from auth.users where id = src.id;
    delete from public.profiles where id = src.id;
  end loop;
end $$;

-- Reserved names: nobody can take admin, adminxd2 or breadblook (the breadblook account already owns its name).
create or replace function public.enforce_reserved_usernames()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if lower(new.username) in ('admin', 'adminxd2', 'breadblook')
     and (tg_op = 'INSERT' or lower(old.username) is distinct from lower(new.username)) then
    raise exception 'That username is reserved.';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_reserved_usernames on public.profiles;
create trigger profiles_reserved_usernames
before insert or update of username on public.profiles
for each row execute function public.enforce_reserved_usernames();

-- Shared bank: Bread Bucks spent by other players are added to the breadblook balance.
create or replace function public.bank_deposit(p_profile_id uuid, p_amount bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Server access is required.';
  end if;
  if p_amount <= 0 then return; end if;
  update public.profiles
  set tokens = least(2147483647::bigint, tokens::bigint + p_amount)
  where lower(username) = 'breadblook' and id <> p_profile_id;
end;
$$;

revoke all on function public.bank_deposit(uuid, bigint) from public, anon, authenticated;
grant execute on function public.bank_deposit(uuid, bigint) to service_role;
