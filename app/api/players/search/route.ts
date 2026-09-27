import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';

export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json([], { status: 200 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  const query = new URL(request.url).searchParams.get('q')?.trim() || '';
  if (query.length < 2) return NextResponse.json([]);
  const { data, error } = await supabase.from('profiles').select('id, username, tokens, equipped_blook_id, stats').ilike('username', `%${query}%`).neq('id', user.id).limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const profiles = data || [];
  const profileIds = profiles.map((profile) => profile.id);
  const equippedIds = profiles.map((profile) => profile.equipped_blook_id).filter(Boolean);
  const [{ data: inventory }, { data: equippedBlooks }] = await Promise.all([
    profileIds.length ? supabase.from('inventory').select('profile_id, quantity').in('profile_id', profileIds) : Promise.resolve({ data: [] }),
    equippedIds.length ? supabase.from('blooks').select('id, name').in('id', equippedIds) : Promise.resolve({ data: [] }),
  ]);
  const [{ data: chestRolls }, { data: chatMessages }] = await Promise.all([
    profileIds.length ? supabase.from('chest_rolls').select('profile_id').in('profile_id', profileIds) : Promise.resolve({ data: [] }),
    profileIds.length ? supabase.from('global_chat_messages').select('profile_id').in('profile_id', profileIds).is('deleted_at', null) : Promise.resolve({ data: [] }),
  ]);
  const equippedById = new Map((equippedBlooks || []).map((blook: any) => [blook.id, blook.name === 'Surgeon' ? 'Doctor' : blook.name]));
  const countByProfile = new Map<string, number>();
  (inventory || []).forEach((item: any) => countByProfile.set(item.profile_id, (countByProfile.get(item.profile_id) || 0) + Number(item.quantity || 0)));
  const capsulesByProfile = new Map<string, number>();
  (chestRolls || []).forEach((item: any) => capsulesByProfile.set(item.profile_id, (capsulesByProfile.get(item.profile_id) || 0) + 1));
  const messagesByProfile = new Map<string, number>();
  (chatMessages || []).forEach((item: any) => messagesByProfile.set(item.profile_id, (messagesByProfile.get(item.profile_id) || 0) + 1));
  return NextResponse.json(profiles.map((profile) => {
    const tokens = Number(profile.tokens) || 0;
    return {
      id: profile.id,
      username: profile.username,
      clanTag: profile.stats?.clanTag || '',
      tokens,
      equippedBlook: equippedById.get(profile.equipped_blook_id) || '',
      inventoryCount: countByProfile.get(profile.id) || 0,
      capsulesOpened: capsulesByProfile.get(profile.id) || 0,
      messagesSent: messagesByProfile.get(profile.id) || 0,
      badges: Array.from(new Set([
        ...(profile.stats?.badges || []),
        ...(tokens >= 10000 ? ['10K Tokens'] : []),
        ...(tokens >= 100000 ? ['100K Tokens'] : []),
        ...(tokens >= 1000000 ? ['1M Tokens'] : []),
      ])),
    };
  }));
}
