-- Device + IP tracking so bans follow a player to new accounts.
-- Device/IP values are salted SHA-256 hashes computed by the server, never raw IPs.

create table if not exists public.account_devices (
  profile_id uuid not null references auth.users(id) on delete cascade,
  device_hash text not null default '',
  ip_hash text not null,
  last_seen_at timestamptz not null default now(),
  primary key (profile_id, device_hash, ip_hash)
);
create index if not exists account_devices_device_idx on public.account_devices (device_hash);

create table if not exists public.network_bans (
  kind text not null check (kind in ('device', 'ip')),
  value_hash text not null,
  profile_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (kind, value_hash, profile_id)
);

alter table public.account_devices enable row level security;
alter table public.network_bans enable row level security;
revoke all on public.account_devices from anon, authenticated;
revoke all on public.network_bans from anon, authenticated;

-- Banning a profile (admin panel or SQL) bans every device it used for the length
-- of the ban, and every IP it used for at most 7 days so shared school Wi-Fi recovers.
create or replace function public.sync_network_bans()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_banned and not coalesce(old.is_banned, false) then
    insert into public.network_bans (kind, value_hash, profile_id, expires_at)
    select 'device', device_hash, new.id, new.ban_expires_at
      from public.account_devices where profile_id = new.id and device_hash <> ''
    union
    select 'ip', ip_hash, new.id, least(coalesce(new.ban_expires_at, 'infinity'::timestamptz), now() + interval '7 days')
      from public.account_devices where profile_id = new.id
    on conflict (kind, value_hash, profile_id) do update set expires_at = excluded.expires_at;
  elsif not new.is_banned and coalesce(old.is_banned, false) then
    delete from public.network_bans where profile_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_sync_network_bans on public.profiles;
create trigger profiles_sync_network_bans
after update of is_banned on public.profiles
for each row execute function public.sync_network_bans();

create or replace function public.network_ban_active(p_device_hash text, p_ip_hash text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.network_bans
    where ((kind = 'device' and value_hash = p_device_hash and p_device_hash <> '')
        or (kind = 'ip' and value_hash = p_ip_hash))
      and (expires_at is null or expires_at > now())
  );
$$;

revoke all on function public.network_ban_active(text, text) from public, anon, authenticated;
grant execute on function public.network_ban_active(text, text) to service_role;
