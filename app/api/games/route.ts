import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';
import { newWordGame } from '../../../lib/chat-games';

export const dynamic = 'force-dynamic';

async function session() {
  const supabase = await createClient();
  const admin = createAdminClient();
  if (!supabase || !admin) return { error: NextResponse.json({ error: 'Games are unavailable.' }, { status: 503 }) };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }) };
  return { admin, user };
}

export async function GET() {
  const state = await session();
  if ('error' in state) return state.error;
  const { admin, user } = state;
  const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data } = await admin
    .from('chat_games')
    .select('id, kind, status, host_id, opponent_id, bet, result, updated_at')
    .eq('kind', 'coinflip')
    .or(`host_id.eq.${user.id},opponent_id.eq.${user.id}`)
    .in('status', ['active', 'done'])
    .gte('updated_at', since)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return NextResponse.json({ game: null });
  const { data: names } = await admin.from('profiles').select('id, username').in('id', [data.host_id, data.opponent_id].filter(Boolean));
  const nameOf = (id: string | null) => names?.find((entry) => entry.id === id)?.username || 'Player';
  return NextResponse.json({ game: { ...data, hostName: nameOf(data.host_id), opponentName: nameOf(data.opponent_id), isHost: data.host_id === user.id } });
}

export async function POST(request: Request) {
  const state = await session();
  if ('error' in state) return state.error;
  const { admin, user } = state;
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || '');
  const args: Record<string, unknown> = { p_profile_id: user.id, p_action: action };

  if (action === 'coinflip_start') {
    args.p_bet = Math.floor(Number(body.bet) || 0);
  } else if (action === 'coinflip_pick') {
    args.p_choice = String(body.choice || '');
  } else if (action === 'wordrace_start' || action === 'unscramble_start') {
    const game = newWordGame(action === 'wordrace_start' ? 'wordrace' : 'unscramble');
    args.p_answer = game.answer;
    args.p_display = game.display;
    args.p_hint = game.hint;
  } else if (action !== 'coinflip_accept' && action !== 'cancel') {
    return NextResponse.json({ error: 'Unknown game action.' }, { status: 400 });
  }

  if (action === 'cancel') {
    const { data: cancelled, error: cancelError } = await admin.rpc('chat_game_cancel', { p_profile_id: user.id });
    if (cancelError) return NextResponse.json({ error: cancelError.message }, { status: 400 });
    return NextResponse.json({ ok: true, result: cancelled });
  }

  const { data, error } = await admin.rpc('chat_game_action', args);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, result: data });
}
