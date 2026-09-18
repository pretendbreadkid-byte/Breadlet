import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../lib/supabase/admin';

export async function POST(request: Request) {
  const body = await request.json();
  const username = String(body.username || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const admin = createAdminClient();

  if (!admin) {
    return NextResponse.json(
      { error: 'Server auth is not configured. Add SUPABASE_SERVICE_ROLE_KEY to .env.local, then restart the dev server.' },
      { status: 503 },
    );
  }
  if (username.length < 3 || !email || password.length < 4) {
    return NextResponse.json({ error: 'Username, email, and password are required.' }, { status: 400 });
  }

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username },
  });

  if (error) {
    const message = error.message.toLowerCase().includes('already')
      ? 'That email address is already registered. Log in with your username and password.'
      : error.message;
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
