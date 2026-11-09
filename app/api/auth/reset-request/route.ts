import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createAdminClient } from '../../../../lib/supabase/admin';

export async function POST(request: Request) {
  const body = await request.json();
  const username = String(body.username || '').trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  // The default (PKCE) link only works in the browser that asked for it, so opening the email on a
  // phone failed. An implicit link carries its own sign-in token, which the game's
  // "Choose a new password" screen (app/components/reset-password.tsx) uses on any device.
  const supabase = url && key ? createClient(url, key, { auth: { flowType: 'implicit', persistSession: false, autoRefreshToken: false } }) : null;
  const admin = createAdminClient();

  if (!supabase || !admin) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  }

  let email = '';
  const { data: profile } = await admin
    .from('profiles')
    .select('email')
    .ilike('username', username)
    .maybeSingle();
  email = profile?.email || '';

  if (!email) {
    const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    email = users.users.find((user) =>
      String(user.user_metadata?.username || '').toLowerCase() === username.toLowerCase(),
    )?.email || '';
  }

  if (email) {
    // The address the player used. Behind the host's proxy request.url can be an internal address.
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
    const proto = request.headers.get('x-forwarded-proto') || new URL(request.url).protocol.replace(':', '');
    const origin = request.headers.get('origin') || (host ? `${proto}://${host}` : new URL(request.url).origin);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/?reset=1`,
    });
    if (error) {
      return NextResponse.json(
        { error: `Supabase could not send the reset email: ${error.message}` },
        { status: 502 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    message: 'If that username exists, a password reset email has been sent. Check your inbox and spam folder.',
  });
}
