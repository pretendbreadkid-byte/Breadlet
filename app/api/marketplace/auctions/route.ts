import { NextResponse } from 'next/server';
import { kidModeBlock } from '../../../../lib/kid-mode';
import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { notify } from '../../../../lib/inbox';
import { loadSiteEdits } from '../../../../lib/site-edits-server';
import { isUntradableBreadlet, untradableReason } from '../../../../lib/gameplay-catalog';

export const dynamic = 'force-dynamic';

// Bazaar auctions (migration 0114). GET: the running auctions (ending soonest first) plus your
// own recent ones. POST { action: 'create', blook, startBid, hours } | { action: 'bid', auctionId,
// amount } | { action: 'cancel', auctionId }.
const NOT_INSTALLED = new Set(['PGRST202', 'PGRST205', '42P01', '42883']);
const SETUP = 'Auctions are still being set up (migration 0114).';

async function session() {
  const supabase = await createClient();
  const admin = createAdminClient();
  if (!supabase || !admin) return { response: NextResponse.json({ error: 'The Bazaar is unavailable.' }, { status: 503 }) };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { response: NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }) };
  return { admin, userId: user.id };
}

const nameOf = (blooks: Map<string, string>, id: string, shiny: boolean) => `${shiny ? 'Shiny ' : ''}${blooks.get(id) || 'Breadlet'}`;

// Ends auctions whose time is up and tells the seller and winner.
async function settle(admin: any) {
  const { data, error } = await admin.rpc('settle_bazaar_auctions');
  if (error || !Array.isArray(data) || !data.length) return;
  const { data: blookRows } = await admin.from('blooks').select('id, name').in('id', Array.from(new Set(data.map((row: any) => row.blook))));
  const blooks = new Map<string, string>((blookRows || []).map((row: any) => [row.id, row.name]));
  for (const row of data) {
    const name = nameOf(blooks, row.blook, row.shiny);
    if (row.status === 'sold') {
      await notify(admin, row.seller, 'bazaar_sale', { title: `Your ${name} auction sold!`, message: `It went for ${Number(row.price).toLocaleString()} Bread Bucks. You got ${(row.price - row.fee).toLocaleString()} after the 10% fee.` });
      await notify(admin, row.winner, 'bazaar_sale', { title: `You won the ${name} auction!`, message: `It's in your Breadlets now. You paid ${Number(row.price).toLocaleString()} Bread Bucks.` });
    } else {
      await notify(admin, row.seller, 'bazaar_sale', { title: `Nobody bid on your ${name}`, message: 'The auction ended with no bids, so it is back in your Breadlets.' });
    }
  }
}

export async function GET() {
  const current = await session();
  if ('response' in current) return current.response;
  const { admin, userId } = current;
  await settle(admin);
  const open = await admin.from('bazaar_auctions').select('id, seller_id, blook_id, shiny, start_bid, top_bid, top_bidder_id, bid_count, ends_at, status').eq('status', 'open').order('ends_at').limit(200);
  if (open.error) return NotInstalled(open.error);
  const mine = await admin.from('bazaar_auctions').select('id, seller_id, blook_id, shiny, start_bid, top_bid, top_bidder_id, bid_count, ends_at, status')
    .neq('status', 'open').or(`seller_id.eq.${userId},top_bidder_id.eq.${userId}`).order('ends_at', { ascending: false }).limit(20);
  const rows = [...(open.data || []), ...(mine.data || [])];
  const blookIds = Array.from(new Set(rows.map((row: any) => row.blook_id)));
  const peopleIds = Array.from(new Set(rows.flatMap((row: any) => [row.seller_id, row.top_bidder_id]).filter(Boolean)));
  const [{ data: blookRows }, { data: people }] = await Promise.all([
    blookIds.length ? admin.from('blooks').select('id, name, rarity').in('id', blookIds) : Promise.resolve({ data: [] }),
    peopleIds.length ? admin.from('profiles').select('id, username').in('id', peopleIds) : Promise.resolve({ data: [] }),
  ]);
  const blooks = new Map<string, any>((blookRows || []).map((row: any) => [row.id, row]));
  const names = new Map<string, string>((people || []).map((row: any) => [row.id, row.username]));
  const shape = (row: any) => ({
    id: row.id,
    blook: `${row.shiny ? 'Shiny ' : ''}${blooks.get(row.blook_id)?.name || 'Breadlet'}`,
    rarity: blooks.get(row.blook_id)?.rarity || 'Common',
    seller: names.get(row.seller_id) || 'Player',
    mineSelling: row.seller_id === userId,
    startBid: row.start_bid,
    topBid: row.top_bid,
    topBidder: row.top_bidder_id ? names.get(row.top_bidder_id) || 'Player' : null,
    mineWinning: row.top_bidder_id === userId,
    bids: row.bid_count,
    endsAt: row.ends_at,
    status: row.status,
    minBid: row.top_bid == null ? row.start_bid : row.top_bid + Math.max(1, Math.ceil(row.top_bid * 0.05)),
  });
  return NextResponse.json({ open: (open.data || []).map(shape), ended: (mine.data || []).map(shape), now: Date.now() });
}

function NotInstalled(error: any) {
  return NextResponse.json({ error: NOT_INSTALLED.has(error?.code) ? SETUP : error?.message || 'Could not load auctions.' }, { status: 503 });
}

export async function POST(request: Request) {
  const current = await session();
  if ('response' in current) return current.response;
  const { admin, userId } = current;
  { const kid = await kidModeBlock(userId); if (kid) return kid; }
  const body = await request.json().catch(() => ({}));
  await settle(admin);

  if (body.action === 'create') {
    await loadSiteEdits(admin);
    const blook = String(body.blook || '');
    const startBid = Math.floor(Number(body.startBid));
    const hours = Math.floor(Number(body.hours));
    if (!blook) return NextResponse.json({ error: 'Pick a Breadlet to auction.' }, { status: 400 });
    if (!Number.isSafeInteger(startBid) || startBid < 1 || startBid > 2147483647) return NextResponse.json({ error: 'Pick a starting bid.' }, { status: 400 });
    if (![1, 6, 12, 24, 48].includes(hours)) return NextResponse.json({ error: 'Pick how long the auction lasts.' }, { status: 400 });
    const { data: seller } = await admin.from('profiles').select('stats').eq('id', userId).maybeSingle();
    if ((seller?.stats?.lockedBlooks || []).includes(blook)) return NextResponse.json({ error: `${blook} is locked. Unlock it in My Breadlets first.` }, { status: 409 });
    if (isUntradableBreadlet(blook)) return NextResponse.json({ error: `${untradableReason(blook)} and can't be sold or traded.` }, { status: 409 });
    const { data, error } = await admin.rpc('bazaar_auction_action', { p_profile_id: userId, p_action: 'create', p_blook_name: blook, p_amount: startBid, p_hours: hours, p_auction_id: null });
    if (error) return NextResponse.json({ error: NOT_INSTALLED.has(error.code) ? SETUP : error.message }, { status: 409 });
    return NextResponse.json({ ...data, message: `${blook} is up for auction for ${hours} hour${hours === 1 ? '' : 's'}.` }, { status: 201 });
  }

  if (body.action === 'bid' || body.action === 'cancel') {
    const auctionId = typeof body.auctionId === 'string' ? body.auctionId : '';
    if (!auctionId) return NextResponse.json({ error: 'Pick an auction.' }, { status: 400 });
    const amount = Math.floor(Number(body.amount) || 0);
    if (body.action === 'bid' && (!Number.isSafeInteger(amount) || amount < 1)) return NextResponse.json({ error: 'Enter a bid.' }, { status: 400 });
    const { data, error } = await admin.rpc('bazaar_auction_action', { p_profile_id: userId, p_action: body.action, p_blook_name: '', p_amount: amount, p_hours: 24, p_auction_id: auctionId });
    if (error) return NextResponse.json({ error: NOT_INSTALLED.has(error.code) ? SETUP : error.message }, { status: 409 });
    if (body.action === 'bid' && data?.outbid) {
      const { data: me } = await admin.from('profiles').select('username').eq('id', userId).maybeSingle();
      const { data: blook } = await admin.from('blooks').select('name').eq('id', data.auction?.blook_id).maybeSingle();
      const name = `${data.auction?.shiny ? 'Shiny ' : ''}${blook?.name || 'Breadlet'}`;
      await notify(admin, data.outbid, 'bazaar_sale', { title: `You were outbid on ${name}`, message: `${me?.username || 'Someone'} bid ${amount.toLocaleString()} Bread Bucks. Your ${Number(data.outbidAmount).toLocaleString()} is back in your balance.`, from: me?.username || '' });
    }
    return NextResponse.json({ ...data, message: body.action === 'bid' ? `You bid ${amount.toLocaleString()} Bread Bucks.` : 'Auction taken down. The Breadlet is back in your Breadlets.' });
  }
  return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
}
