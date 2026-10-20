import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  const database = createAdminClient() || supabase;

  const { data: profiles, error } = await database
    .from('profiles')
    .select('id, username, tokens, equipped_blook_id, stats')
    .eq('is_banned', false)
    .eq('account_status', 'active')
    .order('tokens', { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = profiles || [];
  const blookIds = Array.from(new Set(rows.map((row: any) => row.equipped_blook_id).filter(Boolean)));
  const { data: blooks } = blookIds.length
    ? await database.from('blooks').select('id, name').in('id', blookIds)
    : { data: [] };
  const blookNames = new Map((blooks || []).map((blook: any) => [blook.id, blook.name === 'Surgeon' ? 'Doctor' : blook.name]));

  return NextResponse.json(rows.map((row: any, index: number) => {
    const tokens = Number(row.tokens) || 0;
    return {
      rank: index + 1,
      id: row.id,
      username: row.username,
      tokens,
      equippedBlook: blookNames.get(row.equipped_blook_id) || '',
      badges: Array.from(new Set([
        ...(row.stats?.badges || []),
        'OG',
        ...(tokens >= 10000 ? ['10K Tokens'] : []),
        ...(tokens >= 100000 ? ['100K Tokens'] : []),
        ...(tokens >= 1000000 ? ['1M Tokens'] : []),
      ])),
    };
  }));
}
