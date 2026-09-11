import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';

export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json([], { status: 200 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  const query = new URL(request.url).searchParams.get('q')?.trim() || '';
  if (query.length < 2) return NextResponse.json([]);
  const { data, error } = await supabase.from('profiles').select('id, username, equipped_blook_id').ilike('username', `%${query}%`).neq('id', user.id).limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}
