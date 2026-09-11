import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  const { friendProfileId } = await request.json();
  if (!friendProfileId || friendProfileId === user.id) return NextResponse.json({ error: 'Invalid friend.' }, { status: 400 });
  const { error } = await supabase.from('friends').upsert({ profile_id: user.id, friend_profile_id: friendProfileId, status: 'pending' }, { onConflict: 'profile_id,friend_profile_id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
