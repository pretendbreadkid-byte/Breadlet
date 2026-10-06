import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json([], { status: 200 });

  const { data: listings, error } = await supabase
    .from('marketplace_listings')
    .select('id, price, status, profile_id, blook_id, shiny, blooks(name), profiles(username)')
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) {
    const fallback = await supabase
      .from('marketplace_listings')
      .select('id, price, status, profile_id, blook_id, shiny')
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (fallback.error) return NextResponse.json({ error: fallback.error.message }, { status: 500 });
    
    const profileIds = Array.from(new Set((fallback.data || []).map((l: any) => l.profile_id)));
    const blookIds = Array.from(new Set((fallback.data || []).map((l: any) => l.blook_id)));
    
    const [{ data: profs }, { data: blks }] = await Promise.all([
      profileIds.length ? supabase.from('profiles').select('id, username').in('id', profileIds) : { data: [] },
      blookIds.length ? supabase.from('blooks').select('id, name').in('id', blookIds) : { data: [] },
    ]);
    
    const pMap = new Map((profs || []).map((p: any) => [p.id, p.username]));
    const bMap = new Map((blks || []).map((b: any) => [b.id, b.name]));

    const formatted = (fallback.data || []).map((listing: any) => ({
      id: listing.id,
      seller: pMap.get(listing.profile_id) || 'Player',
      sellerId: listing.profile_id,
      blook: `${listing.shiny ? 'Shiny ' : ''}${bMap.get(listing.blook_id) || 'Bread Blook'}`,
      price: listing.price,
    }));
    return NextResponse.json(formatted);
  }

  const profileIds = Array.from(new Set((listings || []).map((l: any) => l.profile_id)));
  const blookIds = Array.from(new Set((listings || []).map((l: any) => l.blook_id)));
  const [{ data: profs }, { data: blks }] = await Promise.all([
    profileIds.length ? supabase.from('profiles').select('id, username').in('id', profileIds) : { data: [] },
    blookIds.length ? supabase.from('blooks').select('id, name').in('id', blookIds) : { data: [] },
  ]);
  const pMap = new Map((profs || []).map((p: any) => [p.id, p.username]));
  const bMap = new Map((blks || []).map((b: any) => [b.id, b.name]));

  const formatted = (listings || []).map((listing: any) => {
    const profile = Array.isArray(listing.profiles) ? listing.profiles[0] : listing.profiles;
    const blook = Array.isArray(listing.blooks) ? listing.blooks[0] : listing.blooks;
    return {
      id: listing.id,
      seller: profile?.username || pMap.get(listing.profile_id) || 'Player',
      sellerId: listing.profile_id,
      blook: `${listing.shiny ? 'Shiny ' : ''}${blook?.name || bMap.get(listing.blook_id) || 'Bread Blook'}`,
      price: listing.price,
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
  if (action !== 'create' && action !== 'buy') return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  const price = Number(body.price || 0);
  if (action === 'create' && (!Number.isSafeInteger(price) || price < 1 || price > 100000)) return NextResponse.json({ error: 'Invalid listing price.' }, { status: 400 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Marketplace server is not configured.' }, { status: 503 });
  const { data, error } = await admin.rpc('secure_marketplace_action', {
    p_profile_id: user.id, p_action: action, p_blook_name: String(body.blook || ''), p_price: price, p_listing_id: body.listingId || null,
  });
  if (error) return NextResponse.json({ error: error.code === 'PGRST202' ? 'Apply migration 0015_secure_gameplay.sql to enable protected marketplace actions.' : error.message }, { status: 409 });
  return NextResponse.json(data, { status: action === 'create' ? 201 : 200 });
}
