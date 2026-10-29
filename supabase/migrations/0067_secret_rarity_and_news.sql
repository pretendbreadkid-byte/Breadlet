begin;

-- Secret rarity sits between Mythic and Breadled. The five animated Mythics move up to it.
alter table public.blooks drop constraint if exists blooks_rarity_check;
alter table public.blooks
  add constraint blooks_rarity_check
  check (rarity in ('Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Secret', 'Chroma', 'Unique', 'Breadled'));

update public.blooks
set rarity = 'Secret'
where name in ('Pickle', 'Alien', 'Timeglass', 'Tanuki', 'Reindeer');

-- Breadlet News: posts admins write from the News panel. Images are stored as data URLs
-- and served through /api/news?image=<id>.
create table if not exists public.news_posts (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'Update' check (char_length(category) between 1 and 40),
  title text not null check (char_length(title) between 1 and 120),
  body text not null default '' check (char_length(body) <= 4000),
  image text check (image is null or char_length(image) <= 1500000),
  -- Lets the post list skip the image data.
  has_image boolean generated always as (image is not null) stored,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists news_posts_created_at_idx on public.news_posts (created_at desc);

-- Only the server (service role) reads and writes posts.
alter table public.news_posts enable row level security;

commit;
