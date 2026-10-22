import { NextResponse } from 'next/server';
import { isChatModerator } from '../../../../lib/admin-access';
import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';

const APPROVED_BAN_DAYS = 7;

async function moderatorSession() {
  const sessionClient = await createClient();
  if (!sessionClient) return { error: NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 }) };
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }) };
  const database = createAdminClient();
  if (!database) return { error: NextResponse.json({ error: 'Admin server configuration is missing.' }, { status: 503 }) };
  if (!(await isChatModerator(database, user.id))) return { error: NextResponse.json({ error: 'Moderator access is required.' }, { status: 403 }) };
  return { database, userId: user.id };
}

export async function GET() {
  const session = await moderatorSession();
  if ('error' in session) return session.error;
  const { data, error } = await session.database.from('ai_moderation_log')
    .select('id, created_at, action, profile_id, username, messages, reason, undone_at, resolution')
    .order('created_at', { ascending: false }).limit(60);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

// op: "undo" reverses a delete/timeout; "approve" bans a suggested player; "dismiss" rejects a suggestion.
export async function POST(request: Request) {
  const session = await moderatorSession();
  if ('error' in session) return session.error;
  const { database, userId } = session;
  const body = await request.json().catch(() => ({}));
  const { data: entry } = await database.from('ai_moderation_log').select('*').eq('id', String(body.id || '')).maybeSingle();
  if (!entry) return NextResponse.json({ error: 'Log entry not found.' }, { status: 404 });
  const now = new Date().toISOString();

  if (body.op === 'undo') {
    if (entry.undone_at) return NextResponse.json({ error: 'Already undone.' }, { status: 409 });
    if (entry.message_ids?.length) await database.from('global_chat_messages').update({ deleted_at: null }).in('id', entry.message_ids);
    if (entry.action !== 'delete' && entry.profile_id) {
      const { data: profile } = await database.from('profiles').select('stats').eq('id', entry.profile_id).maybeSingle();
      if (profile) await database.from('profiles').update({ stats: { ...(profile.stats || {}), chatMutedUntil: null } }).eq('id', entry.profile_id);
    }
    await database.from('ai_moderation_log').update({ undone_at: now, ...(entry.action === 'ban_suggestion' && !entry.resolution ? { resolution: 'dismissed', resolved_at: now } : {}) }).eq('id', entry.id);
    return NextResponse.json({ ok: true });
  }

  if (entry.action !== 'ban_suggestion' || entry.resolution) return NextResponse.json({ error: 'This suggestion was already handled.' }, { status: 409 });

  if (body.op === 'dismiss') {
    await database.from('ai_moderation_log').update({ resolution: 'dismissed', resolved_at: now }).eq('id', entry.id);
    return NextResponse.json({ ok: true });
  }

  if (body.op === 'approve') {
    if (!entry.profile_id) return NextResponse.json({ error: 'That player no longer exists.' }, { status: 404 });
    const reason = `Chat: ${entry.reason}`;
    const expiresAt = new Date(Date.now() + APPROVED_BAN_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { error: banError } = await database.from('bans').insert({ profile_id: entry.profile_id, reason, is_permanent: false, expires_at: expiresAt, created_by_admin_id: userId });
    if (banError) return NextResponse.json({ error: banError.message }, { status: 400 });
    await database.from('profiles').update({ is_banned: true, ban_reason: reason, ban_expires_at: expiresAt }).eq('id', entry.profile_id);
    await database.from('ai_moderation_log').update({ resolution: 'approved', resolved_at: now }).eq('id', entry.id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
