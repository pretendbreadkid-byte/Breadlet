-- Breadlet AI moderator: throttled review runs, an action log with undo, ban
-- suggestions a human approves, and automatic lifting of expired temporary bans.
-- The AI itself can only delete messages and time players out; it never bans.

create table if not exists public.ai_moderation_state (
  id integer primary key default 1 check (id = 1),
  last_run_at timestamptz not null default 'epoch',
  cursor_at timestamptz not null default now()
);
insert into public.ai_moderation_state (id) values (1) on conflict (id) do nothing;

create table if not exists public.ai_moderation_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  action text not null check (action in ('delete', 'timeout', 'ban_suggestion')),
  profile_id uuid references auth.users(id) on delete set null,
  username text not null default '',
  message_ids uuid[] not null default '{}',
  messages text not null default '',
  reason text not null default '',
  undone_at timestamptz,
  -- For ban suggestions: 'approved' or 'dismissed' once a human decides.
  resolution text check (resolution in ('approved', 'dismissed')),
  resolved_at timestamptz
);
create index if not exists ai_moderation_log_created_idx on public.ai_moderation_log (created_at desc);

alter table public.ai_moderation_state enable row level security;
alter table public.ai_moderation_log enable row level security;
revoke all on public.ai_moderation_state from anon, authenticated;
revoke all on public.ai_moderation_log from anon, authenticated;

-- Claims the next review run (at most one per interval across all servers) and
-- returns where the previous run stopped, or null if another run is too recent.
-- Also lifts temporary bans whose time is up, so 24-hour bans really end.
create or replace function public.claim_ai_moderation_run(p_min_interval_seconds integer)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed timestamptz;
begin
  update public.ai_moderation_state
    set last_run_at = now()
    where id = 1 and last_run_at < now() - make_interval(secs => p_min_interval_seconds)
    returning cursor_at into claimed;
  if claimed is not null then
    update public.profiles
      set is_banned = false, ban_reason = null, ban_expires_at = null
      where is_banned and ban_expires_at is not null and ban_expires_at < now();
  end if;
  return claimed;
end;
$$;

create or replace function public.set_ai_moderation_cursor(p_cursor timestamptz)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ai_moderation_state set cursor_at = greatest(cursor_at, p_cursor) where id = 1;
$$;

revoke all on function public.claim_ai_moderation_run(integer) from public, anon, authenticated;
revoke all on function public.set_ai_moderation_cursor(timestamptz) from public, anon, authenticated;
grant execute on function public.claim_ai_moderation_run(integer) to service_role;
grant execute on function public.set_ai_moderation_cursor(timestamptz) to service_role;
