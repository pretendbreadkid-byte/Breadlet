create extension if not exists pgcrypto;

-- Supabase Auth owns credentials. This table stores only game profile data.
alter table if exists profiles drop column if exists password_hash;
alter table if exists profiles alter column id drop default;
alter table if exists profiles alter column id set not null;
alter table if exists profiles add column if not exists materials jsonb not null default '{}'::jsonb;
alter table if exists profiles add column if not exists friends jsonb not null default '[]'::jsonb;
alter table profiles drop constraint if exists profiles_auth_user_fk;
alter table profiles add constraint profiles_auth_user_fk foreign key (id) references auth.users(id) on delete cascade;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, email)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1), 'BreadletPlayer'), 20),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

insert into public.blooks (id, name, rarity, artwork_key)
values (gen_random_uuid(), 'Bread Blook', 'Common', 'breadblook.jpg')
on conflict (name) do nothing;

create or replace function public.bootstrap_player_state()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare starter_id uuid;
begin
  select id into starter_id from public.blooks where name = 'Bread Blook';
  insert into public.inventory (id, profile_id, blook_id, quantity)
  values (gen_random_uuid(), new.id, starter_id, 1)
  on conflict (profile_id, blook_id) do nothing;
  insert into public.mine_progress (id, profile_id)
  values (gen_random_uuid(), new.id)
  on conflict (profile_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_profile_created_bootstrap on public.profiles;
create trigger on_profile_created_bootstrap
after insert on public.profiles
for each row execute procedure public.bootstrap_player_state();

alter table profiles enable row level security;
alter table inventory enable row level security;
alter table blooks enable row level security;
alter table mine_progress enable row level security;
alter table token_transactions enable row level security;
alter table global_chat_messages enable row level security;
alter table friends enable row level security;
alter table gifts enable row level security;
alter table notifications enable row level security;
alter table marketplace_listings enable row level security;
alter table trades enable row level security;

create policy profiles_select_authenticated on profiles for select to authenticated using (true);
create policy profiles_update_self on profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy inventory_select_authenticated on inventory for select to authenticated using (true);
create policy inventory_owner_write on inventory for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy blooks_select_authenticated on blooks for select to authenticated using (true);
create policy mine_owner on mine_progress for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy transactions_owner_read on token_transactions for select to authenticated using (profile_id = auth.uid());
create policy chat_read_authenticated on global_chat_messages for select to authenticated using (deleted_at is null);
create policy chat_insert_self on global_chat_messages for insert to authenticated with check (profile_id = auth.uid());
create policy friends_participant on friends for all to authenticated using (profile_id = auth.uid() or friend_profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy gifts_participant on gifts for select to authenticated using (sender_profile_id = auth.uid() or receiver_profile_id = auth.uid());
create policy listings_read_authenticated on marketplace_listings for select to authenticated using (true);
create policy listings_owner_write on marketplace_listings for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy trades_participant on trades for all to authenticated using (sender_profile_id = auth.uid() or receiver_profile_id = auth.uid()) with check (sender_profile_id = auth.uid() or receiver_profile_id = auth.uid());

alter publication supabase_realtime add table public.global_chat_messages;
