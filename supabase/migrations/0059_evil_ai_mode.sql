-- Evil AI mode for everyone: while evil_ai_until is in the future, the /ai bot answers every
-- player rudely. Per-player evil mode is stored in profiles.stats.evilAiUntil and needs no column.

alter table public.app_settings add column if not exists evil_ai_until timestamptz;
