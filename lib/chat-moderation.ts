import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { hasBannableSlur, hasSevereSlur } from './chat-filter';
import { createAdminClient } from './supabase/admin';

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

export async function moderateChat(
  database: AdminClient,
  profileId: string,
  message: string,
  isImage = false,
) {
  const normalized = message.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
  const { data, error } = await database.rpc('moderate_chat_attempt', {
    p_profile_id: profileId,
    p_message_hash: createHash('sha256').update(normalized).digest('hex'),
    p_slur_message: !isImage && hasBannableSlur(message) ? message : null,
  });
  if (error) {
    console.error('[CHAT_MODERATION]', error);
    return NextResponse.json({ error: 'Chat moderation is unavailable. Try again later.' }, { status: 503 });
  }
  switch (data?.status) {
    case 'allowed':
      return !isImage && hasSevereSlur(message)
        ? NextResponse.json({ error: 'That message contains prohibited language and was blocked.' }, { status: 400 })
        : null;
    case 'banned_slur': return NextResponse.json({ error: 'Your account was permanently banned for a slur. You may appeal from the login screen.' }, { status: 403 });
    case 'banned': return NextResponse.json({ error: 'Banned accounts cannot chat. You may appeal from the login screen.' }, { status: 403 });
    case 'blocked': return NextResponse.json({ error: 'That message contains a slur and was blocked.' }, { status: 400 });
    case 'muted': return NextResponse.json({ error: 'You are timed out from chat.' }, { status: 403 });
    case 'spam': return NextResponse.json({ error: 'You were muted for 30 minutes for spamming.' }, { status: 429 });
    default:
      console.error('[CHAT_MODERATION] Unexpected response:', data);
      return NextResponse.json({ error: 'Chat moderation is unavailable. Try again later.' }, { status: 503 });
  }
}
