-- Edit mode (/edit in chat, owner only): pack, Breadlet and page edits, plus pictures uploaded
-- for them. Only the server (service role) reads and writes these; players get them through the API.

begin;

create table if not exists public.site_edits (
  key text primary key,
  value jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists public.site_images (
  id uuid primary key default gen_random_uuid(),
  data text not null,
  created_at timestamptz not null default now()
);

alter table public.site_edits enable row level security;
alter table public.site_images enable row level security;
revoke all on public.site_edits from anon, authenticated;
revoke all on public.site_images from anon, authenticated;

commit;
