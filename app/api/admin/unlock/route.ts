import { NextResponse } from 'next/server';
import { hasAdminAccess } from '../../../../lib/admin-access';
import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';

export async function POST(request: Request) {
  const sessionClient = await createClient();
  if (!sessionClient) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Admin server configuration is missing.' }, { status: 503 });
  if (!(await hasAdminAccess(admin, user.id))) return NextResponse.json({ error: 'Administrator access is restricted to the adminxd2 account.' }, { status: 403 });
  return NextResponse.json({ ok: true });
}
