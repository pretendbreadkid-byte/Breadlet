import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { isNameAllowed } from '../../../../lib/chat-filter';
import { isStaffLookalike } from '../../../../lib/admin-access';
import { NETWORK_BANNED_MESSAGE, deviceHasAccount, isNetworkBanned, networkIdentity, recordAccountDevice } from '../../../../lib/network-identity';

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
  if (isStaffLookalike(username)) {
    return NextResponse.json({ error: 'That username looks too much like a staff account. Please pick a different one.' }, { status: 400 });
  }
  if (!isNameAllowed(username)) {
    return NextResponse.json({ error: 'That username is not allowed. Please pick a different one.' }, { status: 400 });
  }
  if (suppliedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(suppliedEmail)) {
    return NextResponse.json({ error: 'Enter a valid email address or leave it blank.' }, { status: 400 });
  }

  if (['admin', 'adminxd2', 'breadblook'].includes(username.toLowerCase())) return NextResponse.json({ error: 'That username is already taken.' }, { status: 409 });
  const { data: existingProfile, error: lookupError } = await admin
    .from('profiles')
    .select('id')
    .ilike('username', username)
    .maybeSingle();
  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });
  if (existingProfile) return NextResponse.json({ error: 'That username is already taken.' }, { status: 409 });

  const referralCode = String(body.referralCode || '').trim().toUpperCase();
  if (referralCode) {
    const { data: referrer } = await admin.from('profiles').select('id').eq('stats->>referralCode', referralCode).maybeSingle();
    if (!referrer) return NextResponse.json({ error: 'That referral code does not exist.' }, { status: 400 });
  }

  if (await isNetworkBanned(admin, request)) return NextResponse.json({ error: NETWORK_BANNED_MESSAGE }, { status: 403 });
  if (await deviceHasAccount(admin, request)) {
    return NextResponse.json({ error: 'This device already has a Breadlet account. Log in to it instead.' }, { status: 409 });
  }

  const { ipHash } = networkIdentity(request);
  const { data: allowed, error: limitError } = await admin.rpc('allow_signup_attempt', { p_ip_hash: ipHash });
  if (limitError) {
    return NextResponse.json({ error: 'Account protection is not installed yet. Apply the latest Supabase migration and retry.' }, { status: 503 });
  }
  if (!allowed) return NextResponse.json({ error: 'Too many account signups from this network. Try again in 24 hours.' }, { status: 429 });

  const email = suppliedEmail || `breadlet-${randomUUID()}@accounts.breadlet.com`;

  const { data: created, error } = await admin.auth.admin.createUser({
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

  if (created?.user) await recordAccountDevice(admin, request, created.user.id);

  if (referralCode) {
    const { error: rewardError } = await admin.rpc('referral_reward', { p_code: referralCode });
    if (rewardError) console.error('[REFERRAL] reward failed:', rewardError.message);
  }

  return NextResponse.json({ ok: true });
}
