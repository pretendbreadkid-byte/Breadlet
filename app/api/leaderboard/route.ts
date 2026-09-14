import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';

export async function GET() {
  const sessionClient = await createClient();
  if (!sessionClient) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: 'Leaderboard requires server configuration.' }, { status: 503 });
  const [{ data: profiles, error: profileError }, { data: clans }] = await Promise.all([
    supabase.from('profiles').select('id, username, tokens'),
    supabase.from('clans').select('id, name, treasury, member_count, thumbnail_url').order('treasury', { ascending: false }),
  ]);
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
  const players = (profiles || []).map((profile) => ({
    id: profile.id,
    username: profile.username,
    tokens: profile.tokens,
  }));
  return NextResponse.json({ players, clans: clans || [] });
}