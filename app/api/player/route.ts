import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

const materialNames = ['Flour', 'Metal', 'Gem', 'Gold', 'Cloth', 'Sugar'];

function emptyMaterials() {
  return Object.fromEntries(materialNames.map((name) => [name, 0]));
}

export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const [{ data: profile, error: profileError }, { data: inventory }, { data: mine }, { data: listings }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('inventory').select('quantity, shiny, blooks(name)').eq('profile_id', user.id),
    supabase.from('mine_progress').select('*').eq('profile_id', user.id).maybeSingle(),
    supabase.from('marketplace_listings').select('id, price, status, blooks(name), profiles(username)').eq('status', 'active').order('created_at', { ascending: false }),
  ]);
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
  const { data: equipped } = profile.equipped_blook_id
    ? await supabase.from('blooks').select('name').eq('id', profile.equipped_blook_id).maybeSingle()
    : { data: null };

  return NextResponse.json({
    profile: {
      ...profile,
      equipped_blook_name: equipped?.name || null,
      badges: profile.stats?.badges || [],
      clan_tag: profile.stats?.clanTag || '',
    },
    inventory: (inventory || []).flatMap((entry: { quantity: number; shiny: boolean; blooks: { name: string }[] | null }) =>
      Array.from({ length: entry.quantity }, () => entry.blooks?.[0]?.name ? `${entry.shiny ? 'Shiny ' : ''}${entry.blooks[0].name}` : null).filter(Boolean),
    ),
    materials: { ...emptyMaterials(), ...(profile.materials || {}) },
    mine,
    listings: (listings || []).map((listing: any) => ({
      id: listing.id,
      seller: listing.profiles?.username || 'Player',
      blook: listing.blooks?.name || 'Bread Blook',
      price: listing.price,
    })),
  });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const body = await request.json();
  const player = body.player || {};
  const inventoryNames = Array.isArray(player.inventory) ? player.inventory.map(String) : [];
  const inventoryCounts = new Map<string, number>();
  inventoryNames.forEach((name: string) => inventoryCounts.set(name, (inventoryCounts.get(name) || 0) + 1));

  const { data: blooks, error: blooksError } = await supabase.from('blooks').select('id, name');
  if (blooksError) return NextResponse.json({ error: blooksError.message }, { status: 500 });
  const blookIds = new Map((blooks || []).map((blook: { id: string; name: string }) => [blook.name, blook.id]));

  const profileUpdate = {
    username: String(player.username || '').trim().slice(0, 20),
    tokens: Math.max(0, Math.floor(Number(player.tokens) || 0)),
    luck: 0,
    stats: { badges: Array.isArray(player.badges) ? player.badges : [], clanTag: String(player.clanTag || '').slice(0, 5) },
    materials: player.materials || emptyMaterials(),
    friends: Array.isArray(player.friends) ? player.friends : [],
    equipped_blook_id: blookIds.get(String(player.equipped || '').replace(/^Shiny /, '')) || null,
    account_status: 'active',
  };
  if (profileUpdate.username.length < 3) return NextResponse.json({ error: 'Username must be 3-20 characters.' }, { status: 400 });

  const { error: profileError } = await supabase.from('profiles').update(profileUpdate).eq('id', user.id);
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 400 });

  const inventoryRows = Array.from(inventoryCounts.entries()).flatMap(([displayName, quantity]) => {
    const shiny = displayName.startsWith('Shiny ');
    const name = shiny ? displayName.slice(6) : displayName;
    const blookId = blookIds.get(name);
    return blookId ? [{ profile_id: user.id, blook_id: blookId, quantity, shiny }] : [];
  });
  const { error: deleteError } = await supabase.from('inventory').delete().eq('profile_id', user.id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 });
  if (inventoryRows.length) {
    const { error: inventoryError } = await supabase.from('inventory').insert(inventoryRows);
    if (inventoryError) return NextResponse.json({ error: inventoryError.message }, { status: 400 });
  }

  await supabase.from('marketplace_listings').delete().eq('profile_id', user.id);
  const listingRows = Array.isArray(player.listings)
    ? player.listings.filter((listing: any) => listing.seller === profileUpdate.username).flatMap((listing: any) => {
      const blookId = blookIds.get(String(listing.blook).replace(/^Shiny /, ''));
      return blookId ? [{ profile_id: user.id, blook_id: blookId, quantity: 1, price: Math.max(0, Math.floor(Number(listing.price) || 0)), status: 'active' }] : [];
    })
    : [];
  if (listingRows.length) {
    const { error: listingError } = await supabase.from('marketplace_listings').insert(listingRows);
    if (listingError) return NextResponse.json({ error: listingError.message }, { status: 400 });
  }

  const mine = player.mined == null && player.pickaxe == null ? null : {
    current_earnings_today: Math.max(0, Math.floor(Number(player.mined) || 0)),
    pickaxe_level: Math.max(0, Math.min(5, Math.floor(Number(player.pickaxe) || 0))),
    updated_at: new Date().toISOString(),
  };
  if (mine) {
    const { error: mineError } = await supabase.from('mine_progress').upsert({ profile_id: user.id, ...mine }, { onConflict: 'profile_id' });
    if (mineError) return NextResponse.json({ error: mineError.message }, { status: 400 });
  }
  return GET();
}

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  const body = await request.json();
  const username = String(body.username || user.user_metadata?.username || user.email?.split('@')[0] || 'BreadletPlayer').trim().slice(0, 20);

  const { error } = await supabase.from('profiles').upsert({
    id: user.id,
    username,
    tokens: Math.max(0, Math.min(2500, Number(body.tokens) || 250)),
    luck: 0,
    stats: {},
    materials: { ...emptyMaterials(), ...(body.materials || {}) },
    account_status: 'active',
  }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return GET();
}
