insert into public.blooks (name, rarity) values
  ('Pixel Apple', 'Common'),
  ('Pixel Ember', 'Common'),
  ('Pixel Crystal Ball', 'Uncommon'),
  ('Pixel Glacier', 'Uncommon'),
  ('Pixel Bomb', 'Rare'),
  ('Pixel Constellation', 'Rare'),
  ('Pixel Relic', 'Epic'),
  ('Pixel Sprinkle Bread', 'Mythic')
on conflict (name) do update set rarity = excluded.rarity, retired = false;

do $$
declare
  replacement record;
  old_blook_id uuid;
  new_blook_id uuid;
  owned record;
begin
  for replacement in
    select * from (values
      ('Pixel Toast', 'Pixel Apple', 'Common'),
      ('Pixel Chick', 'Pixel Ember', 'Common'),
      ('Pixel Ice Slime', 'Pixel Crystal Ball', 'Uncommon'),
      ('Pixel Fuego', 'Pixel Bomb', 'Rare'),
      ('Pixel Wizard', 'Pixel Constellation', 'Rare'),
      ('Pixel UFO', 'Pixel Sprinkle Bread', 'Mythic')
    ) as replacements(old_name, new_name, rarity)
  loop
    select id into old_blook_id from public.blooks where name = replacement.old_name;
    select id into new_blook_id from public.blooks where name = replacement.new_name;
    if old_blook_id is null or new_blook_id is null then
      continue;
    end if;

    for owned in
      select profile_id, quantity, shiny
      from public.inventory
      where blook_id = old_blook_id
    loop
      insert into public.inventory (profile_id, blook_id, quantity, shiny)
      values (owned.profile_id, new_blook_id, owned.quantity, owned.shiny)
      on conflict (profile_id, blook_id, shiny)
      do update set quantity = public.inventory.quantity + excluded.quantity;

      insert into public.notifications (profile_id, type, payload)
      values (
        owned.profile_id,
        'pixel_bread_replacement',
        jsonb_build_object(
          'title', 'Pixel Capsule Bread updated',
          'message', replacement.old_name || ' was replaced with ' || replacement.new_name || ' at the same ' || replacement.rarity || ' rarity.',
          'oldName', replacement.old_name,
          'newName', replacement.new_name,
          'rarity', replacement.rarity,
          'quantity', owned.quantity
        )
      );
    end loop;

    update public.profiles
    set equipped_blook_id = new_blook_id
    where equipped_blook_id = old_blook_id;

    delete from public.inventory where blook_id = old_blook_id;
    update public.blooks set retired = true where id = old_blook_id;
  end loop;
end;
$$;
