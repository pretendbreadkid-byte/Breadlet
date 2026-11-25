import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { moderatorBadges } from '../../../../lib/admin-access';
import { birthdayBadges, ogBadges } from '../../../../lib/og-badge';
import { publicBadges } from '../../../../lib/badges';

export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json([], { status: 200 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const query = params.get('q')?.trim() || '';
  // ?light=1: names starting with the typed letters, for the @mention picker in chat.
  if (params.get('light') === '1') {
    const prefix = query.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
    if (!prefix) return NextResponse.json([]);
    const { data } = await supabase.from('profiles').select('username, equipped_blook_id').ilike('username', `${prefix}%`).neq('id', user.id).order('username').limit(8);
    const ids = Array.from(new Set((data || []).map((row) => row.equipped_blook_id).filter(Boolean)));
    const { data: blooks } = ids.length ? await supabase.from('blooks').select('id, name').in('id', ids) : { data: [] as any[] };
    const nameById = new Map((blooks || []).map((blook: any) => [blook.id, blook.name === 'Surgeon' ? 'Doctor' : blook.name]));
    return NextResponse.json((data || []).map((row) => ({ username: row.username, equippedBlook: nameById.get(row.equipped_blook_id) || '' })), { headers: { 'Cache-Control': 'private, max-age=30' } });
  }
  if (query.length < 2) return NextResponse.json([]);
  // The exact name first, then names starting with it, then names containing it. (Just "containing,
  // any 20" could leave the exact player out: searching Redkit showed FatBatRedkit but not Redkit.)
  // Usernames are letters, numbers and _ only; _ is a wildcard in ilike, so escape it.
  const safe = query.replace(/[^a-zA-Z0-9_]/g, '').replace(/_/g, '\\_');
  if (!safe) return NextResponse.json([]);
  const columns = 'id, username, tokens, equipped_blook_id, stats, created_at';
  const [exact, starts, contains] = await Promise.all([
    supabase.from('profiles').select(columns).ilike('username', safe).neq('id', user.id).limit(1),
    supabase.from('profiles').select(columns).ilike('username', `${safe}%`).neq('id', user.id).order('username').limit(20),
    supabase.from('profiles').select(columns).ilike('username', `%${safe}%`).neq('id', user.id).order('username').limit(40),
  ]);
  const error = exact.error || starts.error || contains.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const seen = new Set<string>();
  const lower = query.toLowerCase();
  const profiles = [...(exact.data || []), ...(starts.data || []), ...(contains.data || []).sort((a: any, b: any) => a.username.length - b.username.length)]
    .filter((profile: any) => !seen.has(profile.id) && seen.add(profile.id) && profile.username.toLowerCase().includes(lower))
    .slice(0, 20);
  const statsDb = createAdminClient() || supabase;
  const profileIds = profiles.map((profile) => profile.id);
  const equippedIds = profiles.map((profile) => profile.equipped_blook_id).filter(Boolean);
  const [{ data: inventory }, { data: equippedBlooks }] = await Promise.all([
    profileIds.length ? statsDb.from('inventory').select('profile_id, quantity').in('profile_id', profileIds) : Promise.resolve({ data: [] }),
    equippedIds.length ? supabase.from('blooks').select('id, name').in('id', equippedIds) : Promise.resolve({ data: [] }),
  ]);
  // Counted per player (fetching every row was slow and stopped at 1000 rows for busy players).
  const counts = await Promise.all(profileIds.map((id) => Promise.all([
    statsDb.from('chest_rolls').select('profile_id', { count: 'exact', head: true }).eq('profile_id', id),
    statsDb.from('global_chat_messages').select('profile_id', { count: 'exact', head: true }).eq('profile_id', id).is('deleted_at', null),
  ])));
  const equippedById = new Map((equippedBlooks || []).map((blook: any) => [blook.id, blook.name === 'Surgeon' ? 'Doctor' : blook.name]));
  const countByProfile = new Map<string, number>();
  (inventory || []).forEach((item: any) => countByProfile.set(item.profile_id, (countByProfile.get(item.profile_id) || 0) + Number(item.quantity || 0)));
  const capsulesByProfile = new Map<string, number>(profileIds.map((id, index) => [id, counts[index][0].count || 0]));
  const messagesByProfile = new Map<string, number>(profileIds.map((id, index) => [id, counts[index][1].count || 0]));
  return NextResponse.json(profiles.map((profile) => {
    const tokens = Number(profile.tokens) || 0;
    return {
      id: profile.id,
      username: profile.username,
      clanTag: profile.stats?.clanTag || '',
      tokens,
      equippedBlook: equippedById.get(profile.equipped_blook_id) || '',
      inventoryCount: countByProfile.get(profile.id) || 0,
      capsulesOpened: (capsulesByProfile.get(profile.id) || 0) + (Number(profile.stats?.capsulesOpened) || 0),
      messagesSent: messagesByProfile.get(profile.id) || 0,
      createdAt: profile.created_at || null,
      badges: publicBadges(Array.from(new Set([
        ...(profile.stats?.badges || []).filter((badge: string) => badge !== 'OG'),
        ...ogBadges(profile.created_at),
        ...birthdayBadges(profile.stats),
        ...moderatorBadges(profile.username),
        ...(tokens >= 10000 ? ['10K Tokens'] : []),
        ...(tokens >= 100000 ? ['100K Tokens'] : []),
        ...(tokens >= 1000000 ? ['1M Tokens'] : []),
      ])), profile.stats),
    };
  }));
}
