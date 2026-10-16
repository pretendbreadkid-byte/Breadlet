begin;

insert into public.blooks (name, rarity, artwork_key)
values ('Ted', 'Unique', 'ted-shopkeeper.svg')
on conflict (name) do update
set rarity = excluded.rarity, artwork_key = excluded.artwork_key;

create or replace function public.record_ted_secret_click(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  player public.profiles%rowtype;
  ted_id uuid;
  click_count integer;
  last_click timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Server gameplay access is required.';
  end if;

  select * into player from public.profiles where id = p_profile_id for update;
  if not found then raise exception 'Player not found.'; end if;
  if player.is_banned or player.account_status <> 'active' then
    raise exception 'This account cannot play.';
  end if;
  last_click := nullif(player.stats->>'tedSecretLastClickAt', '')::timestamptz;
  click_count := case
    when last_click is not null and last_click >= now() - interval '2.5 seconds'
      then coalesce((player.stats->>'tedSecretClickCount')::integer, 0) + 1
    else 1
  end;
  if click_count < 3 then
    update public.profiles
    set stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object(
      'tedSecretClickCount', click_count,
      'tedSecretLastClickAt', now()
    )
    where id = p_profile_id;
    return jsonb_build_object('triggered', false, 'claimed', false);
  end if;

  select id into ted_id from public.blooks where name = 'Ted' and rarity = 'Unique';
  if ted_id is null then raise exception 'Ted is missing from the Breadlet catalog.'; end if;
  if coalesce(player.stats->>'tedSecretClaimed', 'false') = 'true' or exists (
    select 1 from public.inventory
    where profile_id = p_profile_id and blook_id = ted_id and shiny = false and quantity > 0
  ) then
    update public.profiles
    set stats = (coalesce(stats, '{}'::jsonb) - 'tedSecretClickCount' - 'tedSecretLastClickAt')
      || jsonb_build_object('tedSecretClaimed', true)
    where id = p_profile_id;
    return jsonb_build_object('triggered', true, 'claimed', false);
  end if;

  insert into public.inventory (profile_id, blook_id, quantity, shiny)
  values (p_profile_id, ted_id, 1, false)
  on conflict (profile_id, blook_id, shiny) do update
  set quantity = public.inventory.quantity + 1;

  update public.profiles
  set stats = (coalesce(stats, '{}'::jsonb) - 'tedSecretClickCount' - 'tedSecretLastClickAt') || jsonb_build_object(
    'tedSecretClaimed', true,
    'gameplayRevision', coalesce((stats->>'gameplayRevision')::integer, 0) + 1
  )
  where id = p_profile_id;

  return jsonb_build_object('triggered', true, 'claimed', true);
end;
$$;

revoke all on function public.record_ted_secret_click(uuid) from public, anon, authenticated;
grant execute on function public.record_ted_secret_click(uuid) to service_role;

commit;
