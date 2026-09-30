insert into public.blooks (name, rarity) values
  ('Pixel Crystal Ball', 'Uncommon')
on conflict (name) do update set rarity = excluded.rarity, retired = false;

do $$
declare
  old_blook_id uuid;
  new_blook_id uuid;
  owned record;
begin
  select id into old_blook_id from public.blooks where name = 'Pixel Ice Block';
  select id into new_blook_id from public.blooks where name = 'Pixel Crystal Ball';
  if old_blook_id is null or new_blook_id is null then
    return;
  end if;

  for owned in
    select profile_id, quantity, shiny from public.inventory where blook_id = old_blook_id
  loop
    insert into public.inventory (profile_id, blook_id, quantity, shiny)
    values (owned.profile_id, new_blook_id, owned.quantity, owned.shiny)
    on conflict (profile_id, blook_id, shiny)
    do update set quantity = public.inventory.quantity + excluded.quantity;

    insert into public.notifications (profile_id, type, payload)
    values (owned.profile_id, 'pixel_bread_replacement', jsonb_build_object(
      'title', 'Pixel Bread name corrected',
      'message', 'Pixel Ice Block was corrected to Pixel Crystal Ball at the same Uncommon rarity.',
      'oldName', 'Pixel Ice Block',
      'newName', 'Pixel Crystal Ball',
      'rarity', 'Uncommon',
      'quantity', owned.quantity
    ));
  end loop;

  update public.profiles set equipped_blook_id = new_blook_id where equipped_blook_id = old_blook_id;
  delete from public.inventory where blook_id = old_blook_id;
  update public.blooks set retired = true where id = old_blook_id;
end;
$$;