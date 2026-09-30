import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';

type OfferedBlook = { name: string; quantity: number };
type TradeOffer = { tokens: number; blooks: OfferedBlook[] };

const parseOffer = (value: unknown): TradeOffer => {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const tokens = Math.floor(Number(input.tokens) || 0);
  const parsedBlooks = Array.isArray(input.blooks)
    ? input.blooks.map((item) => {
        const entry = item && typeof item === 'object' ? item as Record<string, unknown> : {};
        return { name: String(entry.name || '').trim(), quantity: Math.floor(Number(entry.quantity) || 0) };
      }).filter((item) => item.name && item.quantity > 0)
    : [];
  const blookCounts = new Map<string, number>();
  parsedBlooks.forEach((item) => blookCounts.set(item.name, (blookCounts.get(item.name) || 0) + item.quantity));
  const blooks = Array.from(blookCounts, ([name, quantity]) => ({ name, quantity }));
  return { tokens, blooks };
};

async function auth() {
  const sessionClient = await createClient();
  if (!sessionClient) return { response: NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 }) };
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return { response: NextResponse.json({ error: 'Sign in to trade.' }, { status: 401 }) };
  const admin = createAdminClient();
  if (!admin) return { response: NextResponse.json({ error: 'Server trading is not configured.' }, { status: 503 }) };
  return { admin, userId: user.id };
}

async function validateOffer(admin: ReturnType<typeof createAdminClient> & {}, profileId: string, offer: TradeOffer) {
  if (offer.tokens < 0 || offer.tokens > 100000000) return 'Token amount is invalid.';
  const { data: profile, error: profileError } = await admin.from('profiles').select('tokens').eq('id', profileId).single();
  if (profileError || !profile) return 'Player profile was not found.';
  if (offer.tokens > profile.tokens) return 'You do not have enough tokens for this offer.';
  if (offer.blooks.length > 20) return 'You can include at most 20 Bread types in one offer.';
  const names = offer.blooks.map((item) => item.name.replace(/^Shiny /, ''));
  const { data: blooks, error: blookError } = names.length
    ? await admin.from('blooks').select('id, name').in('name', names)
    : { data: [], error: null };
  if (blookError) return 'Could not validate the Bread offer.';
  const ids = new Map((blooks || []).map((blook) => [blook.name, blook.id]));
  for (const item of offer.blooks) {
    if (item.quantity < 1 || item.quantity > 100) return 'Bread quantities must be between 1 and 100.';
    const blookId = ids.get(item.name.replace(/^Shiny /, ''));
    if (!blookId) return `${item.name} is not tradeable.`;
    const shiny = item.name.startsWith('Shiny ');
    const { data: owned, error } = await admin.from('inventory').select('quantity').eq('profile_id', profileId).eq('blook_id', blookId).eq('shiny', shiny).maybeSingle();
    if (error) return 'Could not verify your collection.';
    if ((owned?.quantity || 0) < item.quantity) return `You do not own ${item.quantity} ${item.name}.`;
  }
  return null;
}

export async function GET() {
  const session = await auth();
  if ('response' in session) return session.response;
  const { data: trades, error } = await session.admin.from('trades').select('*')
    .or(`sender_profile_id.eq.${session.userId},receiver_profile_id.eq.${session.userId}`)
    .order('updated_at', { ascending: false }).limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const participantIds = Array.from(new Set((trades || []).flatMap((trade) => [trade.sender_profile_id, trade.receiver_profile_id])));
  const { data: profiles } = participantIds.length
    ? await session.admin.from('profiles').select('id, username').in('id', participantIds)
    : { data: [] };
  const usernames = new Map((profiles || []).map((profile) => [profile.id, profile.username]));
  return NextResponse.json((trades || []).map((trade) => ({
    ...trade,
    sender_username: usernames.get(trade.sender_profile_id) || 'Player',
    receiver_username: usernames.get(trade.receiver_profile_id) || 'Player',
  })));
}

export async function POST(request: Request) {
  const session = await auth();
  if ('response' in session) return session.response;
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || '');

  if (action === 'create') {
    const receiverUsername = String(body.receiverUsername || '').trim();
    if (!receiverUsername || receiverUsername.length > 20) return NextResponse.json({ error: 'Choose a player to trade with.' }, { status: 400 });
    const { data: receiver, error: receiverError } = await session.admin.from('profiles').select('id, username').ilike('username', receiverUsername).maybeSingle();
    if (receiverError || !receiver) return NextResponse.json({ error: 'Player not found.' }, { status: 404 });
    if (receiver.id === session.userId) return NextResponse.json({ error: 'You cannot trade with yourself.' }, { status: 400 });
    const offer = parseOffer(body.offer);
    const invalid = await validateOffer(session.admin, session.userId, offer);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
    const { data: trade, error } = await session.admin.from('trades').insert({
      sender_profile_id: session.userId,
      receiver_profile_id: receiver.id,
      sender_offer_json: { tokens: 0, blooks: [] },
      receiver_offer_json: { tokens: 0, blooks: [] },
      status: 'pending',
    }).select('*').single();
    if (error || !trade) return NextResponse.json({ error: error?.message || 'Could not create trade.' }, { status: 400 });
    const { data: updated, error: offerError } = await session.admin.rpc('respond_to_trade', {
      p_trade_id: trade.id,
      p_profile_id: session.userId,
      p_action: 'offer',
      p_offer: offer,
    });
    if (offerError) {
      await session.admin.from('trades').delete().eq('id', trade.id);
      return NextResponse.json({ error: offerError.message }, { status: 400 });
    }
    return NextResponse.json({ ...updated, receiver_username: receiver.username }, { status: 201 });
  }

  const tradeId = String(body.tradeId || '');
  if (!tradeId) return NextResponse.json({ error: 'Trade id is required.' }, { status: 400 });
  const { data: trade, error: tradeError } = await session.admin.from('trades').select('*').eq('id', tradeId).maybeSingle();
  if (tradeError || !trade) return NextResponse.json({ error: 'Trade not found.' }, { status: 404 });
  if (![trade.sender_profile_id, trade.receiver_profile_id].includes(session.userId)) return NextResponse.json({ error: 'You are not part of this trade.' }, { status: 403 });

  let offer: TradeOffer | null = null;
  if (action === 'offer') {
    offer = parseOffer(body.offer);
    const invalid = await validateOffer(session.admin, session.userId, offer);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  }
  const { data, error } = await session.admin.rpc('respond_to_trade', {
    p_trade_id: tradeId,
    p_profile_id: session.userId,
    p_action: action,
    p_offer: offer,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}