alter table public.clans add column if not exists thumbnail_url text;

insert into public.blooks (name, rarity) values
  ('Mars', 'Common'), ('Worker', 'Common'), ('Aztec Coin', 'Common'), ('Map', 'Uncommon'), ('Earth', 'Uncommon'), ('Star', 'Rare'), ('Consolation', 'Rare'), ('Eclipse', 'Epic'), ('Alien', 'Mythic'), ('Star Ship', 'Transcendent'),
  ('Chef', 'Uncommon'), ('Surgeon', 'Rare'), ('Doctor', 'Rare'), ('Ninja', 'Epic'), ('Actor', 'Legendary'), ('Caveman', 'Mythic'), ('Crystal Ball', 'Rare'), ('Necklace', 'Epic'), ('Stone Tablet', 'Legendary'), ('Timeglass', 'Mythic'),
  ('Pixel Toast', 'Common'), ('Pixel Chick', 'Common'), ('Pixel Ice Slime', 'Uncommon'), ('Pixel Fuego', 'Rare'), ('Pixel Wizard', 'Rare'), ('Pixel UFO', 'Mythic'), ('Olive Grenade', 'Common'), ('Shuriken', 'Rare'), ('Shield', 'Epic'), ('Spartan', 'Legendary'), ('Golden Shuriken', 'Mythic'),
  ('Blooket Life', 'Uncommon'), ('Green Astronaut', 'Uncommon'), ('Blooket Gods', 'Rare'), ('Fasty Jay', 'Epic'), ('Waymore', 'Epic'), ('Sour Dough', 'Common'), ('Burnt Toast', 'Common'), ('Brioche', 'Common'), ('Donut', 'Uncommon'), ('Cinnamon Roll', 'Uncommon'), ('Holy Bread', 'Mythic'),
  ('Red Rex', 'Transcendent'), ('Albino Crow', 'Uncommon'), ('Mr. Frog', 'Uncommon'), ('Crimson Octopus', 'Mythic'), ('Lava Slime', 'Rare')
on conflict (name) do nothing;

create table if not exists public.migration_records (
  id uuid primary key default gen_random_uuid(),
  migration_code text not null unique,
  status text not null default 'UNCLAIMED' check (status in ('UNCLAIMED', 'CLAIMED', 'COMPLETED', 'REVOKED')),
  encoded_payload text not null,
  security_signature text not null,
  redeemed_profile_id uuid references public.profiles(id),
  claimed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.migration_records enable row level security;

create or replace function public.redeem_breadlet_migration(supplied_code text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare record_data public.migration_records; payload jsonb; item jsonb; blook_data public.blooks;
begin
  select * into record_data from public.migration_records where migration_code = supplied_code for update;
  if not found then raise exception 'Invalid migration code.'; end if;
  if record_data.status <> 'UNCLAIMED' then raise exception 'This migration code has already been redeemed.'; end if;
  if encode(digest(record_data.encoded_payload, 'sha256'), 'hex') <> record_data.security_signature then raise exception 'Migration integrity verification failed.'; end if;
  payload := convert_from(decode(record_data.encoded_payload, 'base64'), 'utf8')::jsonb;
  update public.profiles set tokens = greatest(0, coalesce((payload->>'tokens')::integer, tokens)), luck = greatest(0, coalesce((payload->>'luck')::integer, luck)), materials = coalesce(payload->'materials', materials), stats = coalesce(payload->'stats', stats), daily_reward_streak = coalesce((payload->>'daily_reward_streak')::integer, daily_reward_streak), last_daily_reward_at = coalesce((payload->>'last_daily_reward_at')::timestamptz, last_daily_reward_at) where id = auth.uid();
  for item in select * from jsonb_array_elements(coalesce(payload->'inventory', '[]'::jsonb)) loop
    select * into blook_data from public.blooks where name = item->>'name';
    if found then insert into public.inventory (profile_id, blook_id, quantity, shiny) values (auth.uid(), blook_data.id, greatest(1, coalesce((item->>'quantity')::integer, 1)), coalesce((item->>'shiny')::boolean, false)) on conflict (profile_id, blook_id, shiny) do update set quantity = excluded.quantity; end if;
  end loop;
  update public.migration_records set status = 'COMPLETED', redeemed_profile_id = auth.uid(), claimed_at = now(), completed_at = now() where id = record_data.id;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.redeem_breadlet_migration(text) from public;
grant execute on function public.redeem_breadlet_migration(text) to authenticated;