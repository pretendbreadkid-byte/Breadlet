import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';

async function getSession() {
  const client = await createClient();
  if (!client) return { response: NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 }) };
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { response: NextResponse.json({ error: 'Sign in to chat.' }, { status: 401 }) };
  const admin = createAdminClient();
  if (!admin) return { response: NextResponse.json({ error: 'Trade chat is not configured.' }, { status: 503 }) };
  return { admin, userId: user.id };
}

async function verifyCompletedTrade(admin: NonNullable<ReturnType<typeof createAdminClient>>, tradeId: string, userId: string) {
  const { data: trade, error } = await admin.from('trades').select('id, sender_profile_id, receiver_profile_id, status').eq('id', tradeId).maybeSingle();
  if (error || !trade) return { error: 'Trade was not found.' };
  if (trade.status !== 'completed') return { error: 'Trade chat unlocks after both players accept the trade.' };
  if (trade.sender_profile_id !== userId && trade.receiver_profile_id !== userId) return { error: 'You are not part of this trade.' };
  return { trade };
}

export async function GET(request: Request) {
  const session = await getSession();
  if ('response' in session) return session.response;
  const tradeId = new URL(request.url).searchParams.get('tradeId') || '';
  if (!tradeId) return NextResponse.json({ error: 'Trade id is required.' }, { status: 400 });
  const access = await verifyCompletedTrade(session.admin, tradeId, session.userId);
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: 403 });
  const { data: messages, error } = await session.admin.from('trade_messages').select('id, trade_id, profile_id, message, created_at, profiles(username)').eq('trade_id', tradeId).order('created_at').limit(200);
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return NextResponse.json({ error: 'Apply supabase/migrations/0005_trade_chat_realtime.sql to enable trade chat.' }, { status: 503 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json((messages || []).map((entry: any) => ({ ...entry, username: Array.isArray(entry.profiles) ? entry.profiles[0]?.username : entry.profiles?.username })));
}

export async function POST(request: Request) {
  const session = await getSession();
  if ('response' in session) return session.response;
  const body = await request.json().catch(() => ({}));
  const tradeId = String(body.tradeId || '');
  const message = String(body.message || '').trim().slice(0, 1000);
  if (!tradeId || !message) return NextResponse.json({ error: 'Trade and message are required.' }, { status: 400 });
  const access = await verifyCompletedTrade(session.admin, tradeId, session.userId);
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: 403 });
  const { data, error } = await session.admin.from('trade_messages').insert({ trade_id: tradeId, profile_id: session.userId, message }).select('id, trade_id, profile_id, message, created_at').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const { data: profile } = await session.admin.from('profiles').select('username').eq('id', session.userId).single();
  return NextResponse.json({ ...data, username: profile?.username || 'Player' }, { status: 201 });
}