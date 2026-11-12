-- Browser fingerprints (lib/device-fingerprint.ts) so a banned player can't make a new account
-- just by opening a private window or clearing cookies. Stored as salted hashes like the rest.
-- Fingerprint bans only block new signups (identical school computers can share one).

alter table public.account_devices add column if not exists fingerprint_hash text not null default '';
create index if not exists account_devices_fingerprint_idx on public.account_devices (fingerprint_hash) where fingerprint_hash <> '';

alter table public.network_bans drop constraint if exists network_bans_kind_check;
alter table public.network_bans add constraint network_bans_kind_check check (kind in ('device', 'ip', 'fingerprint'));

-- Banning a profile also bans every fingerprint it used, for the length of the ban.
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
    select 'fingerprint', fingerprint_hash, new.id, new.ban_expires_at
      from public.account_devices where profile_id = new.id and fingerprint_hash <> ''
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
