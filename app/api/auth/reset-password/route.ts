import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../lib/supabase/admin';

// Sets a new password from a reset email link. The link signs the player in with a short-lived
// access token (in the page URL's #hash); this checks the token and changes that account's password.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const accessToken = String(body.accessToken || '');
  const password = String(body.password || '');
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  if (password.length < 6 || password.length > 72) {
    return NextResponse.json({ error: 'Use a password with 6 to 72 characters.' }, { status: 400 });
  }
  const { data: { user } } = accessToken ? await admin.auth.getUser(accessToken) : { data: { user: null } };
  if (!user) {
    return NextResponse.json({ error: 'This reset link has expired or was already used. Ask for a new one.' }, { status: 401 });
  }
  const { error } = await admin.auth.admin.updateUserById(user.id, { password });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const { data: profile } = await admin.from('profiles').select('username').eq('id', user.id).maybeSingle();
  return NextResponse.json({ ok: true, username: profile?.username || '' });
}
