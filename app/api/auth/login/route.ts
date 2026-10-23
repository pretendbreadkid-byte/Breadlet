import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { NETWORK_BANNED_MESSAGE, isNetworkBanned, recordAccountDevice } from '../../../../lib/network-identity';
import { isProtectedFromMute } from '../../../../lib/admin-access';
import { autoBanDeviceAlts } from '../../../../lib/alt-bans';

export async function POST(request: Request) {
  const body = await request.json();
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const supabase = await createClient();
  const admin = createAdminClient();

  if (!supabase || !admin) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  }
  if (!username || !password) {
    return NextResponse.json({ error: 'Username and password are required.' }, { status: 400 });
  }

  // Staff skip device/IP bans so banning a test alt made on the owner's computer can't lock them out.
  if (!isProtectedFromMute(username) && await isNetworkBanned(admin, request)) return NextResponse.json({ error: NETWORK_BANNED_MESSAGE, canAppeal: true }, { status: 403 });

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('email')
    .ilike('username', username)
    .maybeSingle();

  let loginEmail = profile?.email || '';
  if (!loginEmail && !profileError) {
    const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const authUser = users.users.find((user) =>
      String(user.user_metadata?.username || '').toLowerCase() === username.toLowerCase(),
    );
    loginEmail = authUser?.email || '';
  }

  if (!loginEmail) {
    return NextResponse.json({ error: 'Log in failed. Check your username and password, then try again.' }, { status: 401 });
  }

  const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
  if (error) {
    return NextResponse.json({ error: 'Log in failed. Check your username and password, then try again.' }, { status: 401 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    // Record the device first so logging into a second account on it bans the group right away.
    await recordAccountDevice(admin, request, user.id);
    await autoBanDeviceAlts(admin, request).catch(() => undefined);
    const { data: bans } = await admin.from('bans').select('reason, is_permanent, expires_at')
      .eq('profile_id', user.id).order('started_at', { ascending: false }).limit(25);
    const now = Date.now();
    const activeBan = (bans || []).find((ban) =>
      ban.is_permanent || !ban.expires_at || new Date(ban.expires_at).getTime() > now,
    );
    if (activeBan) {
      await supabase.auth.signOut();
      return NextResponse.json(
        { error: `Sorry, your account is banned. Reason: ${activeBan.reason}${activeBan.is_permanent ? ' (permanent)' : ` (until ${new Date(activeBan.expires_at).toLocaleString()})`}`, canAppeal: true },
        { status: 403 },
      );
    }
  }

  return NextResponse.json({ ok: true });
}
