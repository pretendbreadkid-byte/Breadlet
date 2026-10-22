import { NextResponse } from 'next/server';
import { randomInt } from 'node:crypto';
import { createAdminClient } from '../../../lib/supabase/admin';
import { createClient } from '../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randomCode = () => Array.from({ length: 7 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

async function session() {
  const client = await createClient();
  const admin = createAdminClient();
  if (!client || !admin) return { error: NextResponse.json({ error: 'Referrals are unavailable.' }, { status: 503 }) };
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Sign in to use referrals.' }, { status: 401 }) };
  return { admin, user };
}

export async function GET() {
  const state = await session();
  if ('error' in state) return state.error;
  const { admin, user } = state;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await admin.rpc('referral_ensure_code', { p_profile_id: user.id, p_code: randomCode(), p_custom: false });
    if (!error) return NextResponse.json({ code: data.code, count: data.count });
    if (error.code !== '23505') return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ error: 'Could not create a referral code. Try again.' }, { status: 500 });
}

export async function POST(request: Request) {
  const state = await session();
  if ('error' in state) return state.error;
  const { admin, user } = state;
  const body = await request.json().catch(() => ({}));
  const code = String(body.customCode || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{4,16}$/.test(code)) return NextResponse.json({ error: 'Use 4-16 letters or numbers.' }, { status: 400 });
  const { data, error } = await admin.rpc('referral_ensure_code', { p_profile_id: user.id, p_code: code, p_custom: true });
  if (error) return NextResponse.json({ error: error.code === '23505' ? 'That code is already taken.' : error.message }, { status: 409 });
  return NextResponse.json({ code: data.code, count: data.count });
}
