import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json([], { status: 200 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  const { data, error } = await supabase
    .from('global_chat_messages')
    .select('id, message, created_at, profiles(username)')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  const body = await request.json();
  const message = String(body.message || '').trim().slice(0, 500);
  if (!message) return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
  const { data, error } = await supabase
    .from('global_chat_messages')
    .insert({ profile_id: user.id, message })
    .select('id, message, created_at, profiles(username)')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
