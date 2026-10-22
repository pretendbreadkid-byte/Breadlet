-- Lightweight generated columns so list endpoints never download embedded images.
-- Chat images and clan thumbnails are base64 data URLs stored inline (up to ~0.6 MB
-- and ~2 MB each); pulling them on every chat/clan refresh used most of the egress quota.

alter table public.global_chat_messages
  add column if not exists is_image boolean generated always as (message like '[img]%') stored,
  add column if not exists text_body text generated always as (case when message like '[img]%' then '' else message end) stored;

alter table public.clans
  add column if not exists has_thumbnail boolean generated always as (coalesce(thumbnail_url, '') <> '') stored,
  add column if not exists thumbnail_version text generated always as (left(md5(coalesce(thumbnail_url, '')), 12)) stored;
