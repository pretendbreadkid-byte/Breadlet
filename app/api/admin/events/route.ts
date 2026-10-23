import { NextResponse } from 'next/server';
import { hasAdminAccess } from '../../../../lib/admin-access';
import { filterProfanity } from '../../../../lib/chat-filter';
import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';

// How long each "admin abuse" event lasts, in seconds.
const DURATIONS: Record<string, number> = { disco: 60, barrel_roll: 3, announcement: 10, bread_rain: 45 };

// Starts an admin abuse event for everyone online. Owner only.
export async function POST(request: Request) {
  const sessionClient = await createClient();
  if (!sessionClient) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  const database = createAdminClient();
  if (!database) return NextResponse.json({ error: 'Admin server configuration is missing.' }, { status: 503 });
  if (!(await hasAdminAccess(database, user.id))) return NextResponse.json({ error: 'Only the owner can start events.' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const kind = String(body.kind || '');
  if (!DURATIONS[kind]) return NextResponse.json({ error: 'Unknown event.' }, { status: 400 });
  const message = filterProfanity(String(body.message || '').trim().slice(0, 120));
  if (kind === 'announcement' && !message) return NextResponse.json({ error: 'Type a message to announce.' }, { status: 400 });

  const endsAt = new Date(Date.now() + DURATIONS[kind] * 1000).toISOString();
  const { data, error } = await database.from('admin_events').insert({ kind, message, created_by: user.id, ends_at: endsAt }).select('id, kind, message, created_at, ends_at').single();
  if (error) return NextResponse.json({ error: error.code === '42P01' ? 'Run migration 0058 in Supabase to enable admin events.' : error.message }, { status: 500 });
  return NextResponse.json(data);
}
