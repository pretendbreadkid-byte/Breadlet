-- Admin /stock command: puts a Goodybag in Ted's Shop until ends_at, on top of the hourly roll.
-- Only the server (service role) writes rows; players read them live through Realtime.
create table if not exists public.market_stock_overrides (
  pack_name text primary key,
  ends_at timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.market_stock_overrides enable row level security;
revoke insert, update, delete on public.market_stock_overrides from anon, authenticated;
drop policy if exists market_stock_overrides_read on public.market_stock_overrides;
create policy market_stock_overrides_read on public.market_stock_overrides for select to authenticated using (true);
grant select on public.market_stock_overrides to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'market_stock_overrides') then
    alter publication supabase_realtime add table public.market_stock_overrides;
  end if;
end $$;
