import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';

// Server-side verified code so real admin_roles access can only be granted
// by hitting this endpoint with a valid session, never by trusting client state.
const ADMIN_UNLOCK_CODE = process.env.ADMIN_UNLOCK_CODE || 'admincodeiscool32';

export async function POST(request: Request) {
  const sessionClient = await createClient();
  if (!sessionClient) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (String(body.code || '').trim() !== ADMIN_UNLOCK_CODE) {
    return NextResponse.json({ error: 'Incorrect access code.' }, { status: 403 });
  }
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Admin server configuration is missing.' }, { status: 503 });
  const { error } = await admin.from('admin_roles').upsert({ profile_id: user.id, role: 'admin' }, { onConflict: 'profile_id,role' });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
