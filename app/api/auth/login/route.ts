import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';

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

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('email')
    .ilike('username', username)
    .maybeSingle();

  if (profileError || !profile?.email) {
    return NextResponse.json({ error: 'Log in failed. Check your username and password, then try again.' }, { status: 401 });
  }

  const { error } = await supabase.auth.signInWithPassword({ email: profile.email, password });
  if (error) {
    return NextResponse.json({ error: 'Log in failed. Check your username and password, then try again.' }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
