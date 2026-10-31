import { randomInt } from 'crypto';
import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';
import { hasAdminAccess } from '../../../lib/admin-access';
import { CASINO_MAX_BET, CASINO_MIN_BET, MAX_CHIPS, playCasino, type CasinoGame } from '../../../lib/casino';

export const dynamic = 'force-dynamic';

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const readFailure = (code?: string) => fail(code === '42703' ? 'Apply migration 0070_casino_chips_and_keepsake_badges.sql to turn on chips.' : 'Could not read your balance.', 503);

// Admin-only while the Games tab is being tested.
async function signedIn() {
  const supabase = await createClient();
  const database = createAdminClient();
  if (!supabase || !database) return { response: fail('Games are unavailable.', 503) };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { response: fail('Sign in to play.', 401) };
  if (!(await hasAdminAccess(database, user.id))) return { response: fail('Games are not open yet.', 403) };
  return { database, userId: user.id };
}

// GET: the player's chip count.
export async function GET() {
  const session = await signedIn();
  if ('response' in session) return session.response;
  const { data, error } = await session.database.from('profiles').select('chips').eq('id', session.userId).maybeSingle();
  if (error) return readFailure(error.code);
  return NextResponse.json({ chips: Number(data?.chips || 0) });
}

// POST { action: 'exchange', amount }: buys chips with Bread Bucks, 1 for 1. There's no way back.
// POST { game, bet, pick }: plays one round of roulette, slots or dice for chips.
export async function POST(request: Request) {
  const session = await signedIn();
  if ('response' in session) return session.response;
  const { database, userId } = session;

  const body = await request.json().catch(() => ({}));
  if (body.action === 'exchange') {
    const amount = Math.floor(Number(body.amount));
    if (!Number.isSafeInteger(amount) || amount < 1) return fail('Exchange at least 1 Bread Buck.');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { data: profile, error: readError } = await database.from('profiles').select('tokens, chips').eq('id', userId).maybeSingle();
      if (readError) return readFailure(readError.code);
      const tokens = Number(profile?.tokens || 0);
      const chips = Number(profile?.chips || 0);
      if (tokens < amount) return fail('You do not have enough Bread Bucks for that.');
      if (chips + amount > MAX_CHIPS) return fail('You are holding as many chips as the cage allows.');
      const { data: updated, error } = await database.from('profiles').update({ tokens: tokens - amount, chips: chips + amount }).eq('id', userId).eq('tokens', tokens).eq('chips', chips).select('id');
      if (error) return fail(error.message, 500);
      if (updated?.length) return NextResponse.json({ ok: true, tokens: tokens - amount, chips: chips + amount });
    }
    return fail('Your balance changed during the exchange. Try again.', 409);
  }

  const game = String(body.game || '') as CasinoGame;
  const pick = String(body.pick || '');
  const bet = Math.floor(Number(body.bet));
  if (!['roulette', 'slots', 'dice'].includes(game)) return fail('Unknown game.');
  if (!Number.isSafeInteger(bet) || bet < CASINO_MIN_BET || bet > CASINO_MAX_BET) return fail(`Bet between ${CASINO_MIN_BET} and ${CASINO_MAX_BET.toLocaleString()} chips.`);

  const result = playCasino(game, pick, (n) => randomInt(n));
  if (!result) return fail('Pick a bet first.');

  // Only applies if the balance hasn't changed since it was read, so two quick plays can't
  // both spend the same chips.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: profile, error: readError } = await database.from('profiles').select('chips').eq('id', userId).maybeSingle();
    if (readError) return readFailure(readError.code);
    const chips = Number(profile?.chips || 0);
    if (chips < bet) return fail('You do not have enough chips for that bet. Visit the Cashier.');
    const payout = Math.floor(bet * result.multiplier);
    const next = Math.min(MAX_CHIPS, chips - bet + payout);
    const { data: updated, error } = await database.from('profiles').update({ chips: next }).eq('id', userId).eq('chips', chips).select('chips');
    if (error) return fail(error.message, 500);
    if (updated?.length) return NextResponse.json({ ok: true, result, bet, payout, chips: next });
  }
  return fail('Your balance changed while playing. Try again.', 409);
}
