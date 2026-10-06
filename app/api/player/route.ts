import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';

const materialNames = ['Gold', 'Cloth', 'Gem', 'Sugar', 'Flower', 'Metal'];

function emptyMaterials() {
  return Object.fromEntries(materialNames.map((name) => [name, 0]));
}

export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const authorization = request.headers.get('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  const inventoryAdmin = createAdminClient();
  if (!inventoryAdmin) return NextResponse.json({ error: 'Server inventory saving is not configured.' }, { status: 503 });

  const [{ data: profile, error: profileError }, { data: inventory }, { data: mine }, { data: listings }, capsuleCount, messageCount, tradeCount] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    inventoryAdmin.from('inventory').select('quantity, shiny, blooks(name)').eq('profile_id', user.id),
    supabase.from('mine_progress').select('*').eq('profile_id', user.id).maybeSingle(),
    supabase.from('marketplace_listings').select('id, price, status, blooks(name), profiles(username)').eq('status', 'active').order('created_at', { ascending: false }),
    supabase.from('chest_rolls').select('id', { count: 'exact', head: true }).eq('profile_id', user.id),
    supabase.from('global_chat_messages').select('id', { count: 'exact', head: true }).eq('profile_id', user.id),
    supabase.from('trades').select('id', { count: 'exact', head: true }).or(`sender_profile_id.eq.${user.id},receiver_profile_id.eq.${user.id}`).eq('status', 'completed'),
  ]);
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
  const { data: equipped } = profile.equipped_blook_id
    ? await supabase.from('blooks').select('name').eq('id', profile.equipped_blook_id).maybeSingle()
    : { data: null };

  const inventoryRows = (inventory || []) as unknown as Array<{ quantity: number; shiny: boolean; blooks: { name: string } | null }>;

  const wheelSpunAt = profile.stats?.wheelSpunAt;
  const wheelSpunToday = typeof wheelSpunAt === 'string' && wheelSpunAt.slice(0, 10) === new Date().toISOString().slice(0, 10);

  return NextResponse.json({
    profile: {
      ...profile,
      equipped_blook_name: equipped?.name || null,
      badges: profile.stats?.badges || [],
      clan_tag: profile.stats?.clanTag || '',
      wheel_spun: Boolean(profile.stats?.wheelSpun) && wheelSpunToday,
    },
    inventory: inventoryRows.flatMap((entry) =>
      Array.from({ length: entry.quantity }, () => entry.blooks?.name ? `${entry.shiny ? 'Shiny ' : ''}${entry.blooks.name}` : null).filter(Boolean),
    ),
    materials: { ...emptyMaterials(), ...(profile.materials || {}) },
    mine,
    activity: {
      capsulesOpened: (capsuleCount.count || 0) + (Number(profile.stats?.capsulesOpened) || 0),
      messagesSent: messageCount.count || 0,
      completedTrades: tradeCount.count || 0,
    },
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
  const inventoryAdmin = createAdminClient();
  if (!inventoryAdmin) return NextResponse.json({ error: 'Server inventory saving is not configured.' }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const player = body.player || {};
  if (!player || typeof player !== 'object' || Array.isArray(player)) return NextResponse.json({ error: 'Invalid player update.' }, { status: 400 });
  const protectedFields = ['tokens', 'inventory', 'materials', 'badges', 'candy', 'wheelSpun', 'mined', 'pickaxe', 'listings', 'account_status', 'stats'];
  if (protectedFields.some((field) => field in player) || body.candyEarned != null) {
    return NextResponse.json({ error: 'Economy changes must use verified gameplay actions.' }, { status: 403 });
  }
  const { data: profile, error: readError } = await inventoryAdmin.from('profiles').select('id, stats, is_banned, account_status').eq('id', user.id).single();
  if (readError || !profile) return NextResponse.json({ error: 'Player not found.' }, { status: 404 });
  if (profile.is_banned || profile.account_status !== 'active') return NextResponse.json({ error: 'This account cannot play.' }, { status: 403 });
  let equippedId: string | null = null;
  if (player.equipped) {
    const name = String(player.equipped).replace(/^Shiny /, '');
    const { data: blook } = await inventoryAdmin.from('blooks').select('id').eq('name', name).maybeSingle();
    if (!blook) return NextResponse.json({ error: 'Unknown Breadlet.' }, { status: 400 });
    const { data: owned } = await inventoryAdmin.from('inventory').select('quantity').eq('profile_id', user.id).eq('blook_id', blook.id).gt('quantity', 0).limit(1).maybeSingle();
    if (!owned) return NextResponse.json({ error: 'You do not own that Breadlet.' }, { status: 403 });
    equippedId = blook.id;
  }
  const { error } = await inventoryAdmin.from('profiles').update({ equipped_blook_id: equippedId }).eq('id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return GET(request);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  const body = await request.json();
  const username = String(body.username || user.user_metadata?.username || user.email?.split('@')[0] || 'BreadletPlayer').trim().slice(0, 20);

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Player setup is not configured.' }, { status: 503 });
  const { error } = await admin.from('profiles').upsert({
    id: user.id,
    username,
    tokens: 250,
    luck: 0,
    stats: { wheelSpun: false },
    materials: emptyMaterials(),
    account_status: 'active',
  }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return GET(request);
}
