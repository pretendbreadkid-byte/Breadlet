import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';

export async function POST(request: Request) {
  const body = await request.json();
  const username = String(body.username || '').trim();
  const supabase = await createClient();
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
    const origin = new URL(request.url).origin;
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
