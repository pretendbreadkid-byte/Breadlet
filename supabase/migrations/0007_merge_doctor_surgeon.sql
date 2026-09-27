do $$
declare
  doctor_id uuid;
  surgeon_id uuid;
begin
  select id into doctor_id from public.blooks where name = 'Doctor' limit 1;
  select id into surgeon_id from public.blooks where name = 'Surgeon' limit 1;

  if doctor_id is not null and surgeon_id is not null and doctor_id <> surgeon_id then
    update public.profiles
    set equipped_blook_id = doctor_id
    where equipped_blook_id = surgeon_id;

    update public.marketplace_listings
    set blook_id = doctor_id
    where blook_id = surgeon_id;

    insert into public.inventory (profile_id, blook_id, quantity, shiny, retired)
    select profile_id, doctor_id, sum(quantity), shiny, bool_or(retired)
    from public.inventory
    where blook_id = surgeon_id
    group by profile_id, shiny
    on conflict (profile_id, blook_id, shiny) do update
      set quantity = public.inventory.quantity + excluded.quantity,
          retired = public.inventory.retired or excluded.retired;

    delete from public.inventory where blook_id = surgeon_id;
  end if;
end;
$$;
