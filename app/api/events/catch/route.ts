import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';

// Catch one bread during a Bread Rain (+10 Bread Bucks, max 5 per player per rain).
export async function POST(request: Request) {
  const supabase = await createClient();
  const database = createAdminClient();
  if (!supabase || !database) return NextResponse.json({ error: 'Events are unavailable.' }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Log in to catch breads.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const eventId = String(body.eventId || '');
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return NextResponse.json({ error: 'Bad event.' }, { status: 400 });
  const { data, error } = await database.rpc('catch_admin_event_bread', { p_event_id: eventId, p_profile_id: user.id });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json({ catches: data, reward: 10 });
}
