create table if not exists public.reward_requests (
  id uuid primary key default gen_random_uuid(),
  requester_profile_id uuid not null references public.profiles(id) on delete cascade,
  requested_blooks jsonb not null default '[]'::jsonb,
  requested_tokens integer not null default 0 check (requested_tokens between 0 and 100000),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(requested_blooks) = 'array'),
  check (requested_tokens > 0 or jsonb_array_length(requested_blooks) > 0)
);

create index if not exists reward_requests_status_created_idx
  on public.reward_requests (status, created_at desc);

alter table public.reward_requests enable row level security;
create policy reward_requests_participant_read on public.reward_requests
  for select to authenticated
  using (
    requester_profile_id = auth.uid()
    or coalesce((select (p.stats->>'can_review_requests')::boolean from public.profiles p where p.id = auth.uid()), false)
    or exists (select 1 from public.admin_roles r where r.profile_id = auth.uid() and r.role in ('owner', 'admin'))
  );

create or replace function public.review_reward_request(p_request_id uuid, p_reviewer_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.reward_requests%rowtype;
  request_item jsonb;
  requested_name text;
  requested_quantity integer;
  requested_blook_id uuid;
begin
  if not (
    coalesce((select (stats->>'can_review_requests')::boolean from public.profiles where id = p_reviewer_id), false)
    or exists (select 1 from public.admin_roles where profile_id = p_reviewer_id and role in ('owner', 'admin'))
  ) then
    raise exception 'Request reviewer access is required.';
  end if;

  select * into request_row from public.reward_requests where id = p_request_id for update;
  if not found then raise exception 'Request not found.'; end if;
  if request_row.requester_profile_id = p_reviewer_id then raise exception 'You cannot review your own request.'; end if;
  if request_row.status <> 'pending' then raise exception 'This request has already been reviewed.'; end if;
  if p_action not in ('accept', 'decline') then raise exception 'Unknown review action.'; end if;

  if p_action = 'accept' then
    if request_row.requested_tokens > 0 then
      update public.profiles set tokens = tokens + request_row.requested_tokens
        where id = request_row.requester_profile_id;
    end if;
    for request_item in select value from jsonb_array_elements(request_row.requested_blooks) loop
      requested_name := request_item->>'name';
      requested_quantity := (request_item->>'quantity')::integer;
      select id into requested_blook_id from public.blooks where name = requested_name;
      if requested_blook_id is null or requested_quantity < 1 or requested_quantity > 100 then
        raise exception 'Request contains an invalid Blook or quantity.';
      end if;
      insert into public.inventory (profile_id, blook_id, quantity, shiny)
        values (request_row.requester_profile_id, requested_blook_id, requested_quantity, false)
        on conflict (profile_id, blook_id, shiny)
        do update set quantity = public.inventory.quantity + excluded.quantity;
    end loop;
  end if;

  update public.reward_requests
  set status = case when p_action = 'accept' then 'accepted' else 'declined' end,
      reviewed_by = p_reviewer_id,
      reviewed_at = now()
  where id = p_request_id
  returning * into request_row;

  return to_jsonb(request_row);
end;
$$;

revoke all on function public.review_reward_request(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.review_reward_request(uuid, uuid, text) to service_role;