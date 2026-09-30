import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ maintenanceMode: false });
  const { data, error } = await supabase.from('app_settings').select('maintenance_mode').eq('id', 1).maybeSingle();
  if (error || !data) return NextResponse.json({ maintenanceMode: false });
  return NextResponse.json({ maintenanceMode: Boolean(data.maintenance_mode) });
}

export async function POST(request: Request) {
  const sessionClient = await createClient();
  if (!sessionClient) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Admin server configuration is missing.' }, { status: 503 });
  const { data: role } = await admin.from('admin_roles').select('role').eq('profile_id', user.id).in('role', ['owner', 'admin']).limit(1).maybeSingle();
  if (!role) return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const maintenanceMode = Boolean(body.maintenanceMode);
  const { error } = await admin.from('app_settings').upsert({ id: 1, maintenance_mode: maintenanceMode, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, maintenanceMode });
}
