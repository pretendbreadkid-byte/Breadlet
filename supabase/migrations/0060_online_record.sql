-- Record for the most players online at once, shown in the Admin Panel.
-- Players' browsers report who they can see online; the server counts only real, non-banned
-- accounts and calls record_online_peak, which only ever raises the record.

alter table public.app_settings add column if not exists online_record integer not null default 0;
alter table public.app_settings add column if not exists online_record_at timestamptz;

create or replace function public.record_online_peak(p_count integer)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with raised as (
    update public.app_settings
      set online_record = p_count, online_record_at = now()
      where id = 1 and online_record < p_count
      returning online_record, online_record_at
  )
  select coalesce(
    (select jsonb_build_object('record', online_record, 'at', online_record_at, 'raised', true) from raised),
    (select jsonb_build_object('record', online_record, 'at', online_record_at, 'raised', false) from public.app_settings where id = 1)
  );
$$;

revoke all on function public.record_online_peak(integer) from public, anon, authenticated;
grant execute on function public.record_online_peak(integer) to service_role;
