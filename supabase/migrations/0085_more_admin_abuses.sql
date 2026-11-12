-- More admin abuses (app/components/admin-events.tsx): upside down, earthquake, snowstorm,
-- confetti, lights out, Ted jumpscare and a Breadlet parade. They only change what players see.
alter table public.admin_events drop constraint if exists admin_events_kind_check;
alter table public.admin_events add constraint admin_events_kind_check
  check (kind in ('disco', 'barrel_roll', 'announcement', 'bread_rain', 'leaf_shower',
                  'upside_down', 'earthquake', 'snowstorm', 'confetti', 'lights_out', 'ted_jumpscare', 'parade'));
