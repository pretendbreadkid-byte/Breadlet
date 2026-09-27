create or replace function public.bootstrap_player_state()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.mine_progress (profile_id)
  values (new.id)
  on conflict (profile_id) do nothing;
  return new;
end;
$$;