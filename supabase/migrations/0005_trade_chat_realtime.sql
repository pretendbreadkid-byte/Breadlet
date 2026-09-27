create table if not exists public.trade_messages (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists trade_messages_trade_created_idx
  on public.trade_messages (trade_id, created_at);

alter table public.trade_messages enable row level security;
drop policy if exists trade_messages_participant_read on public.trade_messages;
create policy trade_messages_participant_read on public.trade_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.trades t
      where t.id = trade_messages.trade_id
        and t.status = 'completed'
        and auth.uid() in (t.sender_profile_id, t.receiver_profile_id)
    )
  );


do $$
begin
  alter publication supabase_realtime add table public.trades;
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.trade_messages;
exception when duplicate_object then null;
end;
$$;