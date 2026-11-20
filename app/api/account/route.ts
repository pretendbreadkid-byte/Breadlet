import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';
import { isNameAllowed } from '../../../lib/chat-filter';
import { ADMIN_USERNAME, ARTIST_USERNAMES, LIMITED_MODERATOR_USERNAMES, MODERATOR_USERNAMES, isStaffLookalike } from '../../../lib/admin-access';

export const dynamic = 'force-dynamic';

const FAKE_EMAIL_DOMAIN = '@accounts.breadlet.com';
// ab•••@gmail.com
const maskEmail = (email: string) => {
  const [name, domain] = email.split('@');
  return `${name.slice(0, 2)}${'•'.repeat(Math.max(1, Math.min(6, name.length - 2)))}@${domain}`;
};

const RENAME_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
// Staff powers and some badges are tied to these usernames, so they can't be renamed (a freed
// staff name could otherwise be taken by someone else).
const NAME_LOCKED = [ADMIN_USERNAME, ...MODERATOR_USERNAMES, ...LIMITED_MODERATOR_USERNAMES, ...ARTIST_USERNAMES];

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

  // Recovery email: the address password reset links go to. Accounts made without an email have a
  // made-up one (breadlet-...@accounts.breadlet.com) that can't get mail. Login looks the email up from
  // profiles.email first, so both copies are changed together.
  if (body.action === 'email') {
    const email = String(body.email || '').trim().toLowerCase();
    const currentPassword = String(body.currentPassword || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254 || email.endsWith(FAKE_EMAIL_DOMAIN)) {
      return NextResponse.json({ error: 'Enter a real email address.' }, { status: 400 });
    }
    if (!user.email) return NextResponse.json({ error: 'This account has no login email.' }, { status: 400 });
    if (email === user.email.toLowerCase()) return NextResponse.json({ error: 'That is already your recovery email.' }, { status: 400 });
    const { error: checkError } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
    if (checkError) return NextResponse.json({ error: 'Your current password is wrong.' }, { status: 401 });
    const oldEmail = user.email;
    const { error } = await admin.auth.admin.updateUserById(user.id, { email, email_confirm: true, user_metadata: { ...(user.user_metadata || {}), emailProvided: true } });
    if (error) {
      const taken = /already|registered|exists/i.test(error.message);
      return NextResponse.json({ error: taken ? 'Another account already uses that email.' : error.message }, { status: taken ? 409 : 400 });
    }
    const { error: profileError } = await admin.from('profiles').update({ email }).eq('id', user.id);
    if (profileError) {
      // Put the old one back so logging in keeps working.
      await admin.auth.admin.updateUserById(user.id, { email: oldEmail, email_confirm: true });
      return NextResponse.json({ error: 'Your email could not be saved. Try again.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, email: maskEmail(email) });
  }

  return NextResponse.json({ error: 'Unknown account change.' }, { status: 400 });
}

// Settings > Account: is there a real recovery email on this account? (Shown partly hidden.)
export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: 'Accounts are unavailable.' }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const email = user.email || '';
  return NextResponse.json({ email: email && !email.endsWith(FAKE_EMAIL_DOMAIN) ? maskEmail(email) : null });
}
