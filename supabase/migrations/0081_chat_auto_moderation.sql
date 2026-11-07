begin;

create table if not exists public.chat_moderation_attempts (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  message_hash text not null,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists chat_moderation_attempts_profile_time_idx
  on public.chat_moderation_attempts (profile_id, created_at desc, id desc);
alter table public.chat_moderation_attempts enable row level security;
revoke all on public.chat_moderation_attempts from public, anon, authenticated;

create table if not exists public.chat_auto_mutes (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  muted_until timestamptz not null
);
alter table public.chat_auto_mutes enable row level security;
revoke all on public.chat_auto_mutes from public, anon, authenticated;
grant select, delete on public.chat_auto_mutes to service_role;

create table if not exists public.chat_auto_ban_evidence (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default clock_timestamp()
);
alter table public.chat_auto_ban_evidence enable row level security;
revoke all on public.chat_auto_ban_evidence from public, anon, authenticated;
grant select on public.chat_auto_ban_evidence to service_role;

-- Clients must not write chat or account moderation state directly.
revoke insert, update, delete on public.global_chat_messages, public.trade_messages, public.clan_chat_messages, public.profiles
  from public, anon, authenticated;

create or replace function public.guard_moderated_chat_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  player public.profiles%rowtype;
begin
  if tg_table_name = 'global_chat_messages' then
    if new.is_breadlet_bot then return new; end if;
    if tg_op = 'UPDATE' and new.message is not distinct from old.message then return new; end if;
  end if;
  select * into player from public.profiles where id = new.profile_id for update;
  if not found or player.is_banned or player.account_status <> 'active' then
    raise exception 'This account cannot chat.';
  end if;
  if nullif(player.stats->>'chatMutedUntil', '')::timestamptz > clock_timestamp() then
    raise exception 'This account is muted from chat.';
  end if;
  if exists (select 1 from public.chat_auto_mutes where profile_id = new.profile_id and muted_until > clock_timestamp()) then
    raise exception 'This account is muted from chat.';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_moderated_chat_write() from public, anon, authenticated;
drop trigger if exists z_guard_moderated_chat_write on public.global_chat_messages;
create trigger z_guard_moderated_chat_write
before insert or update on public.global_chat_messages
for each row execute function public.guard_moderated_chat_write();
drop trigger if exists z_guard_moderated_chat_write on public.trade_messages;
create trigger z_guard_moderated_chat_write
before insert or update on public.trade_messages
for each row execute function public.guard_moderated_chat_write();

create or replace function public.moderate_chat_attempt(
  p_profile_id uuid,
  p_message_hash text,
  p_slur_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  player public.profiles%rowtype;
  muted_until timestamptz;
  auto_muted_until timestamptz;
  now_at timestamptz;
  burst_count integer;
  matching_count integer;
  protected boolean;
  v_ban_reason text := 'Automatic permanent ban for a slur in chat. You may appeal from the login screen.';
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Server moderation access is required.'; end if;
  if p_message_hash is null or p_message_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid message hash.'; end if;
  if p_slur_message is not null and length(p_slur_message) > 1000 then raise exception 'Invalid moderation evidence.'; end if;

  select * into player from public.profiles where id = p_profile_id for update;
  if not found then raise exception 'Player not found.'; end if;
  now_at := clock_timestamp();
  if player.is_banned or player.account_status <> 'active' then
    return jsonb_build_object('status', 'banned');
  end if;
  protected := lower(trim(player.username)) in ('breadblook', 'xyl1x', 'h0mer');
  if p_slur_message is not null then
    if protected then return jsonb_build_object('status', 'blocked'); end if;
    insert into public.chat_auto_ban_evidence (profile_id, message) values (p_profile_id, p_slur_message);
    insert into public.bans (profile_id, reason, is_permanent, expires_at)
      values (p_profile_id, v_ban_reason, true, null);
    update public.profiles
      set is_banned = true, ban_reason = v_ban_reason, ban_expires_at = null
      where id = p_profile_id;
    -- Do not punish unrelated people on a shared device or network for this automatic ban.
    delete from public.network_bans where profile_id = p_profile_id;
    return jsonb_build_object('status', 'banned_slur');
  end if;

  muted_until := nullif(player.stats->>'chatMutedUntil', '')::timestamptz;
  select m.muted_until into auto_muted_until
    from public.chat_auto_mutes m where m.profile_id = p_profile_id;
  muted_until := greatest(muted_until, auto_muted_until);
  if muted_until is not null and muted_until > now_at then
    return jsonb_build_object('status', 'muted', 'until', muted_until);
  end if;
  if protected then return jsonb_build_object('status', 'allowed'); end if;

  delete from public.chat_moderation_attempts
    where profile_id = p_profile_id and created_at < now_at - interval '1 minute';
  select count(*) into burst_count from public.chat_moderation_attempts
    where profile_id = p_profile_id and created_at >= now_at - interval '10 seconds';
  select count(*) into matching_count from public.chat_moderation_attempts
    where profile_id = p_profile_id
      and message_hash = p_message_hash
      and created_at >= now_at - interval '1 minute';
  if burst_count >= 9 or matching_count >= 4 then
    muted_until := now_at + interval '30 minutes';
    insert into public.chat_auto_mutes (profile_id, muted_until) values (p_profile_id, muted_until)
      on conflict (profile_id) do update set muted_until = excluded.muted_until;
    update public.profiles
      set stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object('chatMutedUntil', muted_until)
      where id = p_profile_id;
    delete from public.chat_moderation_attempts where profile_id = p_profile_id;
    return jsonb_build_object('status', 'spam', 'until', muted_until);
  end if;
  insert into public.chat_moderation_attempts (profile_id, message_hash, created_at)
    values (p_profile_id, p_message_hash, now_at);
  return jsonb_build_object('status', 'allowed');
end;
$$;
revoke all on function public.moderate_chat_attempt(uuid, text, text) from public, anon, authenticated;
grant execute on function public.moderate_chat_attempt(uuid, text, text) to service_role;

notify pgrst, 'reload schema';
commit;
