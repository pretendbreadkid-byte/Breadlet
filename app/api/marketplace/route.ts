import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';
import { notify } from '../../../lib/inbox';

export const dynamic = 'force-dynamic';
const MAX_MARKETPLACE_PRICE = 2147483647;

// Each seller's equipped Breadlet, shown next to their listings.
async function sellerBlookNames(supabase: any, profiles: { id: string; equipped_blook_id?: string | null }[]) {
  const equippedIds = Array.from(new Set(profiles.map((profile) => profile.equipped_blook_id).filter(Boolean)));
  if (!equippedIds.length) return new Map<string, string>();
  const { data } = await supabase.from('blooks').select('id, name').in('id', equippedIds);
  const names = new Map((data || []).map((blook: any) => [blook.id, blook.name === 'Surgeon' ? 'Doctor' : blook.name]));
  return new Map(profiles.map((profile) => [profile.id, String(names.get(profile.equipped_blook_id) || '')]));
}

// The last 10 sales of one Breadlet (?history=Name), newest first, for the Bazaar price history.
async function priceHistory(name: string) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json([]);
  const shiny = name.startsWith('Shiny ');
  const { data: blook } = await admin.from('blooks').select('id').eq('name', name.replace(/^Shiny /, '')).maybeSingle();
  if (!blook) return NextResponse.json([]);
  const { data } = await admin.from('marketplace_listings').select('price, sold_at, shiny')
    .eq('blook_id', blook.id).eq('status', 'sold').not('sold_at', 'is', null)
    .order('sold_at', { ascending: false }).limit(25);
  const sales = (data || []).filter((row: any) => Boolean(row.shiny) === shiny).slice(0, 10).map((row: any) => ({ price: row.price, soldAt: row.sold_at }));
  return NextResponse.json(sales, { headers: { 'Cache-Control': 'private, max-age=60' } });
}

export async function GET(request: Request) {
  const history = new URL(request.url).searchParams.get('history');
  if (history) return priceHistory(history.slice(0, 80));
  const supabase = await createClient();
  if (!supabase) return NextResponse.json([], { status: 200 });

  const { data: listings, error } = await supabase
    .from('marketplace_listings')
    .select('id, price, quantity, status, profile_id, blook_id, shiny, created_at, blooks(name), profiles(username)')
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) {
    const fallback = await supabase
      .from('marketplace_listings')
      .select('id, price, quantity, status, profile_id, blook_id, shiny, created_at')
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (fallback.error) return NextResponse.json({ error: fallback.error.message }, { status: 500 });
    
    const profileIds = Array.from(new Set((fallback.data || []).map((l: any) => l.profile_id)));
    const blookIds = Array.from(new Set((fallback.data || []).map((l: any) => l.blook_id)));
    
    const [{ data: profs }, { data: blks }] = await Promise.all([
      profileIds.length ? supabase.from('profiles').select('id, username, equipped_blook_id').in('id', profileIds) : { data: [] },
      blookIds.length ? supabase.from('blooks').select('id, name').in('id', blookIds) : { data: [] },
    ]);
    
    const pMap = new Map((profs || []).map((p: any) => [p.id, p.username]));
    const bMap = new Map((blks || []).map((b: any) => [b.id, b.name]));
    const sellerBlooks = await sellerBlookNames(supabase, profs || []);

    const formatted = (fallback.data || []).map((listing: any) => ({
      id: listing.id,
      seller: pMap.get(listing.profile_id) || 'Player',
      sellerId: listing.profile_id,
      blook: `${listing.shiny ? 'Shiny ' : ''}${bMap.get(listing.blook_id) || 'Bread Blook'}`,
      price: listing.price,
      quantity: listing.quantity,
      listedAt: listing.created_at,
      sellerBlook: sellerBlooks.get(listing.profile_id) || '',
    }));
    return NextResponse.json(formatted);
  }

  const profileIds = Array.from(new Set((listings || []).map((l: any) => l.profile_id)));
  const blookIds = Array.from(new Set((listings || []).map((l: any) => l.blook_id)));
  const [{ data: profs }, { data: blks }] = await Promise.all([
    profileIds.length ? supabase.from('profiles').select('id, username, equipped_blook_id').in('id', profileIds) : { data: [] },
    blookIds.length ? supabase.from('blooks').select('id, name').in('id', blookIds) : { data: [] },
  ]);
  const pMap = new Map((profs || []).map((p: any) => [p.id, p.username]));
  const bMap = new Map((blks || []).map((b: any) => [b.id, b.name]));
  const sellerBlooks = await sellerBlookNames(supabase, profs || []);

  const formatted = (listings || []).map((listing: any) => {
    const profile = Array.isArray(listing.profiles) ? listing.profiles[0] : listing.profiles;
    const blook = Array.isArray(listing.blooks) ? listing.blooks[0] : listing.blooks;
    return {
      id: listing.id,
      seller: profile?.username || pMap.get(listing.profile_id) || 'Player',
      sellerId: listing.profile_id,
      blook: `${listing.shiny ? 'Shiny ' : ''}${blook?.name || bMap.get(listing.blook_id) || 'Bread Blook'}`,
      price: listing.price,
      quantity: listing.quantity,
      listedAt: listing.created_at,
      sellerBlook: sellerBlooks.get(listing.profile_id) || '',
    };
  });

  return NextResponse.json(formatted);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const action = body.action || 'create';
  if (action === 'cancel') {
    const listingId = typeof body.listingId === 'string' ? body.listingId : '';
    if (!listingId) return NextResponse.json({ error: 'A listing ID is required.' }, { status: 400 });
    const cancelAdmin = createAdminClient();
    if (!cancelAdmin) return NextResponse.json({ error: 'Marketplace server is not configured.' }, { status: 503 });
    const { data, error } = await cancelAdmin.rpc('cancel_marketplace_listing', { p_profile_id: user.id, p_listing_id: listingId });
    if (error) return NextResponse.json({ error: error.code === 'PGRST202' ? 'Apply migration 0037_cancel_marketplace_listing.sql to enable taking down listings.' : error.message }, { status: 409 });
    return NextResponse.json(data);
  }
  if (action !== 'create' && action !== 'buy') return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  const price = Number(body.price || 0);
  if (action === 'create' && (!Number.isSafeInteger(price) || price < 1 || price > MAX_MARKETPLACE_PRICE)) return NextResponse.json({ error: 'Invalid listing price.' }, { status: 400 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Marketplace server is not configured.' }, { status: 503 });
  const blookName = String(body.blook || '');
  let sellerName = '';
  if (action === 'create') {
    const { data: seller } = await admin.from('profiles').select('username, stats').eq('id', user.id).maybeSingle();
    if ((seller?.stats?.lockedBlooks || []).includes(blookName)) return NextResponse.json({ error: `${blookName} is locked. Unlock it in My Breadlets to list it.` }, { status: 409 });
    sellerName = seller?.username || '';
    const { data: blook } = await admin.from('blooks').select('rarity').eq('name', blookName.replace(/^Shiny /, '')).maybeSingle();
    if (blook?.rarity === 'Unique') return NextResponse.json({ error: `${blookName} is Unique and can't be sold or traded.` }, { status: 409 });
  }
  // Looked up before the sale (it's marked sold after), so the seller can be told what sold.
  const listing = action === 'buy' && body.listingId
    ? (await admin.from('marketplace_listings').select('profile_id, price, shiny, blooks(name, rarity)').eq('id', body.listingId).maybeSingle()).data as any
    : null;
  // Listings made before Uniques were locked can't be bought either (the seller can still cancel).
  if ((Array.isArray(listing?.blooks) ? listing.blooks[0] : listing?.blooks)?.rarity === 'Unique') return NextResponse.json({ error: 'Unique Breadlets can't be sold or traded.' }, { status: 409 });
  const { data, error } = await admin.rpc('secure_marketplace_action', {
    p_profile_id: user.id, p_action: action, p_blook_name: String(body.blook || ''), p_price: price, p_listing_id: body.listingId || null,
  });
  if (error) return NextResponse.json({ error: error.code === 'PGRST202' ? 'Apply migration 0015_secure_gameplay.sql to enable protected marketplace actions.' : error.message }, { status: 409 });
  if (listing?.profile_id && listing.profile_id !== user.id) {
    const { data: buyer } = await admin.from('profiles').select('username').eq('id', user.id).maybeSingle();
    const blookName = `${listing.shiny ? 'Shiny ' : ''}${(Array.isArray(listing.blooks) ? listing.blooks[0] : listing.blooks)?.name || 'Breadlet'}`;
    const earned = Number(listing.price) - Math.floor(Number(listing.price) * 0.1);
    await notify(admin, listing.profile_id, 'bazaar_sale', {
      title: `Your ${blookName} sold!`,
      message: `${buyer?.username || 'A player'} bought it on the Bazaar for ${Number(listing.price).toLocaleString()} Bread Bucks. You got ${earned.toLocaleString()} after the 10% fee.`,
      from: buyer?.username || '',
    });
  }
  if (action === 'create') {
    // Players with this Breadlet on their wishlist hear about the new listing.
    const { data: wishers } = await admin.from('profiles').select('id').contains('stats', { wishlist: [blookName] }).neq('id', user.id).limit(200);
    if (wishers?.length) {
      await notify(admin, wishers.map((row: any) => row.id), 'wishlist', {
        title: `${blookName} is on the Bazaar!`,
        message: `${sellerName || 'A player'} listed one for ${price.toLocaleString()} Bread Bucks. It's on your wishlist.`,
        from: sellerName,
      });
    }
  }
  return NextResponse.json(data, { status: action === 'create' ? 201 : 200 });
}
