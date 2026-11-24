-- Polls on Breadlet News posts: a post can have 2-6 answers, and each signed-in player gets one vote
-- (they can change it). Only the server reads or writes votes (app/api/news).
alter table public.news_posts add column if not exists poll_options text[]
  check (poll_options is null or (array_length(poll_options, 1) between 2 and 6));

create table if not exists public.news_poll_votes (
  post_id uuid not null references public.news_posts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  choice smallint not null check (choice between 0 and 5),
  created_at timestamptz not null default now(),
  primary key (post_id, profile_id)
);

alter table public.news_poll_votes enable row level security;
revoke all on public.news_poll_votes from anon, authenticated;
