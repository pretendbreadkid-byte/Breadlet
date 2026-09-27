insert into public.blooks (name, rarity) values
  ('Bread Blook', 'Mythic'),
  ('Golden Grenade', 'Rare'),
  ('Lagoon', 'Rare'),
  ('Lion', 'Legendary'),
  ('Yeti', 'Legendary'),
  ('Sandwich', 'Legendary'),
  ('Butterfly', 'Legendary'),
  ('Blackbeard', 'Legendary'),
  ('Sugar Glider', 'Legendary'),
  ('Tyrannosaurus Rex', 'Legendary'),
  ('Megalodon', 'Legendary'),
  ('Megabot', 'Legendary'),
  ('King', 'Legendary'),
  ('Phantom King', 'Mythic'),
  ('Rainbow Astro', 'Mythic'),
  ('Golden UFO', 'Legendary'),
  ('Mr. Receipt', 'Rare')
on conflict (name) do update set rarity = excluded.rarity;

create or replace function public.save_player_inventory(p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  item jsonb;
  item_blook_id uuid;
  item_quantity integer;
  item_shiny boolean;
begin
  if auth.uid() is null then
    raise exception 'Sign in to save your Blooks.';
  end if;
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'Inventory payload must be an array.';
  end if;

  delete from public.inventory where profile_id = auth.uid();

  for item in select value from jsonb_array_elements(p_items) loop
    item_blook_id := nullif(item->>'blook_id', '')::uuid;
    item_quantity := coalesce((item->>'quantity')::integer, 0);
    item_shiny := coalesce((item->>'shiny')::boolean, false);
    if item_blook_id is null or item_quantity < 1 then
      raise exception 'Inventory contains an invalid Blook row.';
    end if;
    if not exists (select 1 from public.blooks where id = item_blook_id) then
      raise exception 'Inventory references a Blook missing from the catalog.';
    end if;
    insert into public.inventory (profile_id, blook_id, quantity, shiny)
    values (auth.uid(), item_blook_id, item_quantity, item_shiny);
  end loop;
end;
$$;

revoke all on function public.save_player_inventory(jsonb) from public, anon;
grant execute on function public.save_player_inventory(jsonb) to authenticated;
