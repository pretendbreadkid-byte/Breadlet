insert into public.blooks (name, rarity) values
  ('Pixel Apple', 'Common'),
  ('Pixel Caramel', 'Common'),
  ('Pixel Crystal Ball', 'Uncommon'),
  ('Pixel Bomb', 'Rare'),
  ('Pixel Constellation', 'Rare'),
  ('Pixel Aztec Coin', 'Epic'),
  ('Pixel Lagoon', 'Legendary'),
  ('Pixel Sprinkle Bread', 'Mythic')
on conflict (name) do update set rarity = excluded.rarity, retired = false;

do $$
declare
  replacement record;
  old_bread_id uuid;
  new_bread_id uuid;
  owned record;
begin
  for replacement in
    select * from (values
      ('Pixel Toast', 'Pixel Apple', 'Common'),
      ('Pixel Chick', 'Pixel Caramel', 'Common'),
      ('Pixel Ice Slime', 'Pixel Crystal Ball', 'Uncommon'),
      ('Pixel Fuego', 'Pixel Bomb', 'Rare'),
      ('Pixel Wizard', 'Pixel Constellation', 'Rare'),
      ('Pixel UFO', 'Pixel Sprinkle Bread', 'Mythic'),
      ('Pixel Ember', 'Pixel Caramel', 'Common'),
      ('Pixel Ice Block', 'Pixel Crystal Ball', 'Uncommon'),
      ('Pixel Glacier', 'Pixel Lagoon', 'Legendary'),
      ('Pixel Relic', 'Pixel Aztec Coin', 'Epic')
    ) as replacements(old_name, new_name, rarity)
  loop
    select id into old_bread_id from public.blooks where name = replacement.old_name;
    select id into new_bread_id from public.blooks where name = replacement.new_name;
    if old_bread_id is null or new_bread_id is null or old_bread_id = new_bread_id then
      continue;
    end if;

    for owned in
      select profile_id, quantity, shiny from public.inventory where blook_id = old_bread_id
    loop
      insert into public.inventory (profile_id, blook_id, quantity, shiny)
      values (owned.profile_id, new_bread_id, owned.quantity, owned.shiny)
      on conflict (profile_id, blook_id, shiny)
      do update set quantity = public.inventory.quantity + excluded.quantity;

      insert into public.notifications (profile_id, type, payload)
      values (owned.profile_id, 'pixel_bread_replacement', jsonb_build_object(
        'title', 'Pixel Capsule Bread replaced',
        'message', replacement.old_name || ' was switched to ' || replacement.new_name || '. Your ' || owned.quantity || ' owned ' || case when owned.quantity = 1 then 'copy was' else 'copies were' end || ' transferred.',
        'oldName', replacement.old_name,
        'newName', replacement.new_name,
        'rarity', replacement.rarity,
        'quantity', owned.quantity
      ));
    end loop;

    update public.profiles set equipped_blook_id = new_bread_id where equipped_blook_id = old_bread_id;
    delete from public.inventory where blook_id = old_bread_id;
    update public.blooks set retired = true where id = old_bread_id;
  end loop;
end;
$$;
