import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';

const scoreByRarity: Record<string, number> = { Common: 1, Uncommon: 5, Rare: 10, Epic: 15, Legendary: 20, Mythic: 30, Unique: 40, Transcendent: 75 };

export async function GET() {
  const sessionClient = await createClient();
  if (!sessionClient) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: 'Leaderboard requires server configuration.' }, { status: 503 });
  const [{ data: profiles, error: profileError }, { data: inventory, error: inventoryError }, { data: clans }] = await Promise.all([
    supabase.from('profiles').select('id, username, tokens, equipped_blook_id'),
    supabase.from('inventory').select('profile_id, blook_id, blooks(name, rarity)'),
    supabase.from('clans').select('id, name, treasury, member_count, thumbnail_url').order('treasury', { ascending: false }),
  ]);
  if (profileError || inventoryError) return NextResponse.json({ error: profileError?.message || inventoryError?.message }, { status: 500 });
  const byPlayer = new Map<string, { score: number; blooks: number; equipped: string | null }>();
  for (const entry of inventory || []) {
    const blook = Array.isArray(entry.blooks) ? entry.blooks[0] : entry.blooks;
    if (!blook) continue;
    const stats = byPlayer.get(entry.profile_id) || { score: 0, blooks: 0, equipped: null };
    stats.score += scoreByRarity[blook.rarity] || 0;
    stats.blooks += 1;
    byPlayer.set(entry.profile_id, stats);
  }
  const players = (profiles || []).map((profile) => ({
    id: profile.id,
    username: profile.username,
    tokens: profile.tokens,
    blookScore: byPlayer.get(profile.id)?.score || 0,
    uniqueBlooks: byPlayer.get(profile.id)?.blooks || 0,
  }));
  return NextResponse.json({ players, clans: clans || [] });
}