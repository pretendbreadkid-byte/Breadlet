import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

// Unread notifications by default; ?inbox=1 returns the latest 60, read or not, for the Inbox.
export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  const inbox = new URL(request.url).searchParams.get('inbox') === '1';
  let query = supabase.from('notifications').select('id, type, payload, is_read, created_at').eq('profile_id', user.id);
  query = inbox ? query.order('created_at', { ascending: false }).limit(60) : query.eq('is_read', false).order('created_at', { ascending: true }).limit(50);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data || []);
}

// Marks one notification ({ id }) or all of them ({ all: true }) as read.
export async function PATCH(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || '');
  if (!id && body.all !== true) return NextResponse.json({ error: 'Notification ID is required.' }, { status: 400 });
  let query = supabase.from('notifications').update({ is_read: true }).eq('profile_id', user.id);
  query = body.all === true ? query.eq('is_read', false) : query.eq('id', id);
  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
