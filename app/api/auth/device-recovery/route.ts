import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { networkIdentity } from '../../../../lib/network-identity';

// Admin-granted account recovery. When a player can't get into their account (no email to reset
// with), an admin can give the device that last logged into it 30 minutes to choose a new password
// (profiles.stats.recovery, set from the player's profile). This only works from that exact device,
// and only once.
//   POST { username, password }
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return NextResponse.json({ error: 'Enter your username.' }, { status: 400 });
  if (password.length < 4 || password.length > 72) return NextResponse.json({ error: 'Use a password with 4 to 72 characters.' }, { status: 400 });

  const noAccess = NextResponse.json({ error: "This device doesn't have recovery access for that account. Ask an admin to give it access, then try again on the device you last logged in with." }, { status: 403 });
  const { data: profile } = await admin.from('profiles').select('id, username, stats').ilike('username', username).maybeSingle();
  if (!profile) return noAccess;
  const stats = (profile.stats || {}) as Record<string, any>;
  const recovery = stats.recovery;
  const { deviceHash } = networkIdentity(request);
  if (!recovery || !deviceHash || recovery.deviceHash !== deviceHash) return noAccess;
  if (!(Date.parse(recovery.expiresAt) > Date.now())) {
    return NextResponse.json({ error: 'Your recovery access ran out. Ask an admin to give it again.' }, { status: 403 });
  }

  const { error } = await admin.auth.admin.updateUserById(profile.id, { password });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  // One use only.
  const { recovery: _used, ...rest } = stats;
  await admin.from('profiles').update({ stats: rest }).eq('id', profile.id);
  return NextResponse.json({ ok: true, username: profile.username });
}
