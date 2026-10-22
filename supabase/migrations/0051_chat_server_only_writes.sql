-- Players could insert chat rows straight through the public Supabase API,
-- skipping the server's slur filter and timeouts. All chat writes now go
-- through /api/chat and /api/trades/messages, which use the service role.
drop policy if exists chat_insert_self on public.global_chat_messages;
revoke insert, update, delete on public.global_chat_messages from anon, authenticated;
revoke insert, update, delete on public.trade_messages from anon, authenticated;
