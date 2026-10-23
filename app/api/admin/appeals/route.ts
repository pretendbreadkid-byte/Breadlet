import { NextResponse } from 'next/server';
import { hasAdminAccess } from '../../../../lib/admin-access';
import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';

export const dynamic = 'force-dynamic';

async function adminSession() {
  const sessionClient = await createClient();
  if (!sessionClient) return { error: NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 }) };
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }) };
  const database = createAdminClient();
  if (!database) return { error: NextResponse.json({ error: 'Admin server configuration is missing.' }, { status: 503 }) };
  if (!(await hasAdminAccess(database, user.id))) return { error: NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 }) };
  return { database };
}

// Pending appeals first, then the most recent decisions.
export async function GET() {
  const session = await adminSession();
  if ('error' in session) return session.error;
  const { data, error } = await session.database.from('appeals')
    .select('id, profile_id, reason, status, admin_note, created_at, reviewed_at, profiles(username, ban_reason)')
    .order('created_at', { ascending: false }).limit(60);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data || []).map((row: any) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return { id: row.id, profileId: row.profile_id, username: profile?.username || 'Player', banReason: profile?.ban_reason || '', message: row.reason, status: row.status, note: row.admin_note || '', createdAt: row.created_at, reviewedAt: row.reviewed_at };
  });
  rows.sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending'));
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const session = await adminSession();
  if ('error' in session) return session.error;
  const { database } = session;
  const body = await request.json().catch(() => ({}));
  const decision = body.decision === 'approve' ? 'approved' : body.decision === 'deny' ? 'declined' : '';
  const note = String(body.note || '').trim().slice(0, 300) || null;
  if (!decision) return NextResponse.json({ error: 'Choose accept or deny.' }, { status: 400 });

  const { data: appeal } = await database.from('appeals').select('id, profile_id, status').eq('id', String(body.id || '')).maybeSingle();
  if (!appeal) return NextResponse.json({ error: 'Appeal not found.' }, { status: 404 });
  if (appeal.status !== 'pending') return NextResponse.json({ error: 'That appeal was already decided.' }, { status: 409 });

  if (decision === 'approved') {
    const now = new Date().toISOString();
    // End every active ban. Unbanning the profile also lifts its device/IP bans (migration 0052),
    // and altAppealApproved stops the alt auto-ban from banning them again.
    await database.from('bans').update({ is_permanent: false, expires_at: now }).eq('profile_id', appeal.profile_id).or(`is_permanent.eq.true,expires_at.is.null,expires_at.gt.${now}`);
    const { data: profile } = await database.from('profiles').select('stats').eq('id', appeal.profile_id).maybeSingle();
    const { error } = await database.from('profiles').update({ is_banned: false, ban_reason: null, ban_expires_at: null, stats: { ...(profile?.stats || {}), altAppealApproved: true } }).eq('id', appeal.profile_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  await database.from('appeals').update({ status: decision, admin_note: note, reviewed_at: new Date().toISOString() }).eq('id', appeal.id);
  return NextResponse.json({ ok: true, status: decision });
}
