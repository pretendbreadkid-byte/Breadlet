alter table public.global_chat_messages enable row level security;

grant select, insert on public.global_chat_messages to authenticated;

drop policy if exists chat_read_authenticated on public.global_chat_messages;
create policy chat_read_authenticated
  on public.global_chat_messages
  for select
  to authenticated
  using (deleted_at is null);

drop policy if exists chat_insert_self on public.global_chat_messages;
create policy chat_insert_self
  on public.global_chat_messages
  for insert
  to authenticated
  with check (profile_id = auth.uid());

do $$
begin
  alter publication supabase_realtime add table public.global_chat_messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;
