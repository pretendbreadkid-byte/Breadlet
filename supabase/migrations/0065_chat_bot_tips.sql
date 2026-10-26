-- The Breadlet bot posts a tip after every 30 player messages in chat (was 20), from this list.
create or replace function public.post_breadlet_chat_fact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  message_count bigint;
  facts text[] := array[
    'Share your referral code with friends who make an account to get Bread Bucks!',
    'Remember, making alt accounts is prohibited.',
    'Also play Picklet!',
    'Play safe and have fun, and always remember to be kind to others.',
    'Having fun? Join the Discord: https://discord.gg/vVnUMgmFM8',
    'Thank you to the mods for helping!',
    'Remember, cross trading is not allowed and will result in a permanent ban.',
    'You can change your password or username in Settings.',
    'Use /ai to ask a question.',
    'Need to report an issue? Report it in the Discord: https://discord.gg/vVnUMgmFM8'
  ];
begin
  if new.is_breadlet_bot then
    return new;
  end if;

  update public.global_chat_bot_cadence
  set human_message_count = human_message_count + 1
  where id = 1
  returning human_message_count into message_count;

  if message_count % 30 = 0 then
    perform set_config('app.breadlet_bot_insert', 'true', true);
    insert into public.global_chat_messages (profile_id, message, is_breadlet_bot, created_at)
    values (
      new.profile_id,
      facts[1 + floor(random() * array_length(facts, 1))::integer],
      true,
      clock_timestamp()
    );
    perform set_config('app.breadlet_bot_insert', 'false', true);
  end if;

  return new;
end;
$$;
