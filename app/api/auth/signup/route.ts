import { NextResponse } from 'next/server';
import { createHash, randomUUID } from 'node:crypto';
import { createAdminClient } from '../../../../lib/supabase/admin';

export async function POST(request: Request) {
  const body = await request.json();
  const username = String(body.username || '').trim();
  const suppliedEmail = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const admin = createAdminClient();

  if (!admin) {
    return NextResponse.json(
      { error: 'Server auth is not configured. Add SUPABASE_SERVICE_ROLE_KEY to .env.local, then restart the dev server.' },
      { status: 503 },
    );
  }
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username) || password.length < 4) {
    return NextResponse.json({ error: 'Use a 3-20 character username (letters, numbers, underscores) and a password with at least 4 characters.' }, { status: 400 });
  }
  if (suppliedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(suppliedEmail)) {
    return NextResponse.json({ error: 'Enter a valid email address or leave it blank.' }, { status: 400 });
  }

  const { data: existingProfile, error: lookupError } = await admin
    .from('profiles')
    .select('id')
    .ilike('username', username)
    .maybeSingle();
  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });
  if (existingProfile) return NextResponse.json({ error: 'That username is already taken.' }, { status: 409 });

  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const remoteIp = forwardedFor || request.headers.get('x-real-ip') || 'unknown';
  const ipSalt = process.env.SIGNUP_LIMIT_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || 'breadlet-signup-limit';
  const ipHash = createHash('sha256').update(`${ipSalt}:${remoteIp}`).digest('hex');
  const { data: allowed, error: limitError } = await admin.rpc('allow_signup_attempt', { p_ip_hash: ipHash });
  if (limitError) {
    return NextResponse.json({ error: 'Account protection is not installed yet. Apply the latest Supabase migration and retry.' }, { status: 503 });
  }
  if (!allowed) return NextResponse.json({ error: 'Too many account signups from this network. Try again in 24 hours.' }, { status: 429 });

  const email = suppliedEmail || `breadlet-${randomUUID()}@accounts.breadlet.com`;

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username, emailProvided: Boolean(suppliedEmail) },
  });

  if (error) {
    const message = error.message.toLowerCase().includes('already')
      ? 'That email address is already registered. Log in with your username and password.'
      : error.message;
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
