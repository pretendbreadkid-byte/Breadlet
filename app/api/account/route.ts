import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';
import { isNameAllowed } from '../../../lib/chat-filter';
import { ADMIN_USERNAME, ARTIST_USERNAMES, MODERATOR_USERNAMES, isStaffLookalike } from '../../../lib/admin-access';

export const dynamic = 'force-dynamic';

const RENAME_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
// Staff powers and some badges are tied to these usernames, so they can't be renamed (a freed
// staff name could otherwise be taken by someone else).
const NAME_LOCKED = [ADMIN_USERNAME, ...MODERATOR_USERNAMES, ...ARTIST_USERNAMES];

// Settings > Account: change your username (once a week) or your password.
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const admin = createAdminClient();
  if (!supabase || !admin) return NextResponse.json({ error: 'Accounts are unavailable.' }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in to change your account.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));

  if (body.action === 'username') {
    const username = String(body.username || '').trim();
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return NextResponse.json({ error: 'Use 3-20 letters, numbers or underscores.' }, { status: 400 });
    if (isStaffLookalike(username) || NAME_LOCKED.includes(username.toLowerCase()) || ['adminxd2'].includes(username.toLowerCase())) {
      return NextResponse.json({ error: 'That username is not allowed. Please pick a different one.' }, { status: 400 });
    }
    if (!isNameAllowed(username)) return NextResponse.json({ error: 'That username is not allowed. Please pick a different one.' }, { status: 400 });
    const { data: profile } = await admin.from('profiles').select('username, stats').eq('id', user.id).single();
    if (!profile) return NextResponse.json({ error: 'Player not found.' }, { status: 404 });
    if (NAME_LOCKED.includes(String(profile.username).toLowerCase())) return NextResponse.json({ error: 'Staff and artist usernames can\'t be changed.' }, { status: 403 });
    if (profile.username === username) return NextResponse.json({ error: 'That is already your username.' }, { status: 400 });
    const lastChange = Date.parse(profile.stats?.usernameChangedAt || '') || 0;
    const wait = lastChange + RENAME_COOLDOWN_MS - Date.now();
    if (wait > 0) return NextResponse.json({ error: `You can change your username again in ${Math.ceil(wait / 86400000)} day(s).` }, { status: 429 });
    const { data: taken } = await admin.from('profiles').select('id').ilike('username', username).neq('id', user.id).limit(1).maybeSingle();
    if (taken) return NextResponse.json({ error: 'That username is already taken.' }, { status: 409 });
    const { error } = await admin.from('profiles')
      .update({ username, stats: { ...(profile.stats || {}), usernameChangedAt: new Date().toISOString(), previousUsername: profile.username } })
      .eq('id', user.id);
    if (error) return NextResponse.json({ error: error.code === '23505' ? 'That username is already taken.' : error.message }, { status: 400 });
    await admin.auth.admin.updateUserById(user.id, { user_metadata: { ...(user.user_metadata || {}), username } });
    return NextResponse.json({ ok: true, username });
  }

  if (body.action === 'password') {
    const currentPassword = String(body.currentPassword || '');
    const newPassword = String(body.newPassword || '');
    if (newPassword.length < 4) return NextResponse.json({ error: 'Your new password needs at least 4 characters.' }, { status: 400 });
    if (!user.email) return NextResponse.json({ error: 'This account has no login email.' }, { status: 400 });
    const { error: checkError } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
    if (checkError) return NextResponse.json({ error: 'Your current password is wrong.' }, { status: 401 });
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown account change.' }, { status: 400 });
}
