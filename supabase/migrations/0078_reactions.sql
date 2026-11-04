-- Emoji reactions on chat messages and news posts. One row per player, message and emoji.
-- Only the server (service role) reads and writes these; players go through /api/reactions.

begin;

create table if not exists public.chat_reactions (
  message_id uuid not null references public.global_chat_messages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, profile_id, emoji)
);

create table if not exists public.news_reactions (
  post_id uuid not null references public.news_posts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (post_id, profile_id, emoji)
);

alter table public.chat_reactions enable row level security;
alter table public.news_reactions enable row level security;
revoke all on public.chat_reactions from anon, authenticated;
revoke all on public.news_reactions from anon, authenticated;

commit;
