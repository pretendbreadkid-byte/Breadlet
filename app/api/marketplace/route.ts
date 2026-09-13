import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json([], { status: 200 });

  const { data: listings, error } = await supabase
    .from('marketplace_listings')
    .select('id, price, status, profile_id, blook_id, blooks(name), profiles(username)')
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) {
    const fallback = await supabase
      .from('marketplace_listings')
      .select('id, price, status, profile_id, blook_id')
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
      blook: bMap.get(listing.blook_id) || 'Bread Blook',
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
      blook: blook?.name || bMap.get(listing.blook_id) || 'Bread Blook',
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

  const body = await request.json();
  const action = body.action || 'create';

  if (action === 'create') {
    const blookName = String(body.blook || '').trim();
    const price = Math.max(1, Math.min(100000, Math.floor(Number(body.price) || 10)));
    if (!blookName) return NextResponse.json({ error: 'Blook is required.' }, { status: 400 });

    const cleanName = blookName.replace(/^Shiny /, '');
    await supabase.from('blooks').upsert({ name: cleanName, rarity: 'Common' }, { onConflict: 'name' });
    const { data: blookRow } = await supabase.from('blooks').select('id, name').eq('name', cleanName).single();
    if (!blookRow) return NextResponse.json({ error: 'Blook not found.' }, { status: 404 });

    const { data: inserted, error: insertError } = await supabase
      .from('marketplace_listings')
      .insert({
        profile_id: user.id,
        blook_id: blookRow.id,
        quantity: 1,
        price,
        status: 'active',
      })
      .select('id, price, status, profile_id, blook_id')
      .single();

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 400 });
    return NextResponse.json({ ok: true, listing: inserted }, { status: 201 });
  }

  if (action === 'buy') {
    const listingId = body.listingId;
    if (!listingId) return NextResponse.json({ error: 'Listing ID is required.' }, { status: 400 });

    const { data: listing, error: listingErr } = await supabase
      .from('marketplace_listings')
      .select('id, price, status, profile_id, blook_id, blooks(name)')
      .eq('id', listingId)
      .eq('status', 'active')
      .single();

    if (listingErr || !listing) return NextResponse.json({ error: 'Listing is no longer active.' }, { status: 404 });

    const [{ data: buyerProfile }, { data: sellerProfile }] = await Promise.all([
      supabase.from('profiles').select('tokens').eq('id', user.id).single(),
      supabase.from('profiles').select('tokens').eq('id', listing.profile_id).single(),
    ]);

    if (!buyerProfile || buyerProfile.tokens < listing.price) {
      return NextResponse.json({ error: 'Insufficient tokens.' }, { status: 400 });
    }

    await Promise.all([
      supabase.from('profiles').update({ tokens: buyerProfile.tokens - listing.price }).eq('id', user.id),
      sellerProfile ? supabase.from('profiles').update({ tokens: sellerProfile.tokens + listing.price }).eq('id', listing.profile_id) : Promise.resolve(),
      supabase.from('marketplace_listings').update({ status: 'sold', sold_at: new Date().toISOString() }).eq('id', listingId),
      supabase.from('inventory').insert({ profile_id: user.id, blook_id: listing.blook_id, quantity: 1 }),
    ]);

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
}
