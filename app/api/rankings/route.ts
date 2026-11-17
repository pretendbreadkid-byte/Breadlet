import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';
import { publicBadges } from '../../../lib/badges';
import { ADMIN_USERNAME, isStaffLookalike } from '../../../lib/admin-access';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  const database = createAdminClient() || supabase;
  if (new URL(request.url).searchParams.get('board') === 'garden') return gardenBoard(database);

  const { data: profiles, error } = await database
    .from('profiles')
    .select('id, username, tokens, equipped_blook_id, stats')
    .eq('is_banned', false)
    .eq('account_status', 'active')
    // The owner account is kept off the leaderboard.
    .not('username', 'ilike', ADMIN_USERNAME)
    .order('tokens', { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Impersonation names (like "breadlet" or "breadbIook") never show on the leaderboard.
  const rows = (profiles || []).filter((row: any) => !isStaffLookalike(row.username));
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
      badges: publicBadges(Array.from(new Set([
        ...(row.stats?.badges || []),
        ...(tokens >= 10000 ? ['10K Tokens'] : []),
        ...(tokens >= 100000 ? ['100K Tokens'] : []),
        ...(tokens >= 1000000 ? ['1M Tokens'] : []),
      ])), row.stats),
    };
  }));
}

// Most Garden Tokens: everyone's all-time Garden Tokens from picking crops (spending them on props
// doesn't knock you down).
async function gardenBoard(database: any) {
  const { data: gardens, error } = await database
    .from('breadlet_fields')
    .select('profile_id, total:state->gardenTokensTotal, current:state->gardenTokens')
    .limit(5000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Gardens saved before the all-time total existed count what they have now.
  const totals = new Map<string, number>((gardens || []).map((row: any) => [row.profile_id, Math.max(Number(row.total) || 0, Number(row.current) || 0)]));
  const ids = Array.from(totals.keys()).filter((id) => (totals.get(id) || 0) > 0).sort((a, b) => (totals.get(b) || 0) - (totals.get(a) || 0)).slice(0, 80);
  if (!ids.length) return NextResponse.json([]);
  const { data: profiles } = await database
    .from('profiles')
    .select('id, username, tokens, equipped_blook_id, stats, is_banned, account_status')
    .in('id', ids);
  const rows = (profiles || [])
    .filter((row: any) => !row.is_banned && row.account_status === 'active' && String(row.username).toLowerCase() !== ADMIN_USERNAME.toLowerCase() && !isStaffLookalike(row.username))
    .sort((a: any, b: any) => (totals.get(b.id) || 0) - (totals.get(a.id) || 0))
    .slice(0, 50);
  const blookIds = Array.from(new Set(rows.map((row: any) => row.equipped_blook_id).filter(Boolean)));
  const { data: blooks } = blookIds.length ? await database.from('blooks').select('id, name').in('id', blookIds) : { data: [] };
  const blookNames = new Map((blooks || []).map((blook: any) => [blook.id, blook.name === 'Surgeon' ? 'Doctor' : blook.name]));
  return NextResponse.json(rows.map((row: any, index: number) => ({
    rank: index + 1,
    id: row.id,
    username: row.username,
    tokens: totals.get(row.id) || 0,
    equippedBlook: blookNames.get(row.equipped_blook_id) || '',
    badges: publicBadges(row.stats?.badges || [], row.stats),
  })));
}
