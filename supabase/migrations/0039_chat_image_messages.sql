-- Allow image messages (base64 data URLs, including SVG) in global chat.
alter table public.global_chat_messages
  drop constraint if exists global_chat_messages_message_check;
alter table public.global_chat_messages
  add constraint global_chat_messages_message_check
  check (char_length(message) between 1 and 600000);
