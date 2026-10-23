import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';
import { filterProfanity } from '../../../lib/chat-filter';

export const dynamic = 'force-dynamic';

const REAPPEAL_HOURS = 24;

// A banned player can't log in, so they prove who they are with their username and password
// here. Not blocked by device/IP bans: those are exactly the players who need to appeal.
export async function POST(request: Request) {
  const supabase = await createClient();
  const admin = createAdminClient();
  if (!supabase || !admin) return NextResponse.json({ error: 'Appeals are unavailable right now.' }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const message = filterProfanity(String(body.message || '').trim()).slice(0, 1000);
  if (!username || !password) return NextResponse.json({ error: 'Enter your username and password above first.' }, { status: 400 });
  if (message.length < 10) return NextResponse.json({ error: 'Tell the admins a bit more (at least 10 characters).' }, { status: 400 });

  const { data: profile } = await admin.from('profiles').select('id, email, is_banned').ilike('username', username).maybeSingle();
  if (!profile) return NextResponse.json({ error: 'Check your username and password, then try again.' }, { status: 401 });
  // Same email lookup as login: older profiles keep the email only on the auth user.
  let email = profile.email || '';
  if (!email) email = (await admin.auth.admin.getUserById(profile.id)).data.user?.email || '';
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  await supabase.auth.signOut();
  if (signInError) return NextResponse.json({ error: 'Check your username and password, then try again.' }, { status: 401 });

  const { data: bans } = await admin.from('bans').select('is_permanent, expires_at').eq('profile_id', profile.id);
  const activeBan = profile.is_banned || (bans || []).some((ban: any) => ban.is_permanent || !ban.expires_at || Date.parse(ban.expires_at) > Date.now());
  if (!activeBan) return NextResponse.json({ error: 'Your account is not banned. If this device is blocked, ask an admin for help.' }, { status: 400 });

  const { data: latest } = await admin.from('appeals').select('status, admin_note, reviewed_at').eq('profile_id', profile.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (latest?.status === 'pending') return NextResponse.json({ error: 'You already have an appeal waiting. An admin will look at it soon.' }, { status: 409 });
  if (latest?.status === 'declined' && latest.reviewed_at && Date.now() - Date.parse(latest.reviewed_at) < REAPPEAL_HOURS * 3600000) {
    return NextResponse.json({ error: `Your last appeal was denied${latest.admin_note ? `: ${latest.admin_note}` : ''}. You can appeal again ${REAPPEAL_HOURS} hours after that.` }, { status: 409 });
  }

  const { error } = await admin.from('appeals').insert({ profile_id: profile.id, reason: message });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
