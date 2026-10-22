-- Unban every player and block banned/restricted accounts from posting in global chat.
update public.profiles
set is_banned = false, ban_reason = null, ban_expires_at = null, account_status = 'active'
where is_banned or account_status <> 'active';

drop policy if exists chat_insert_self on public.global_chat_messages;
create policy chat_insert_self on public.global_chat_messages for insert to authenticated
with check (
  profile_id = auth.uid()
  and exists (select 1 from public.profiles p where p.id = auth.uid() and not p.is_banned and p.account_status = 'active')
);
