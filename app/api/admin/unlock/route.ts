import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';

export async function POST(request: Request) {
  const sessionClient = await createClient();
  if (!sessionClient) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Admin server configuration is missing.' }, { status: 503 });
  const { data: role, error } = await admin.from('admin_roles').select('role').eq('profile_id', user.id).in('role', ['owner', 'admin']).limit(1).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!role) return NextResponse.json({ error: 'An owner must grant your account administrator access.' }, { status: 403 });
  return NextResponse.json({ ok: true });
}
