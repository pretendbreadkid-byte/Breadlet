import { randomInt } from 'crypto';
import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';
import { hasAdminAccess } from '../../../lib/admin-access';
import { CASINO_MAX_BET, CASINO_MIN_BET, playCasino, type CasinoGame } from '../../../lib/casino';

export const dynamic = 'force-dynamic';

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// POST { game, bet, pick }: plays one round of roulette, slots or dice for Bread Bucks.
// Admin-only while the Games tab is being tested.
export async function POST(request: Request) {
  const supabase = await createClient();
  const database = createAdminClient();
  if (!supabase || !database) return fail('Games are unavailable.', 503);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('Sign in to play.', 401);
  if (!(await hasAdminAccess(database, user.id))) return fail('Games are not open yet.', 403);

  const body = await request.json().catch(() => ({}));
  const game = String(body.game || '') as CasinoGame;
  const pick = String(body.pick || '');
  const bet = Math.floor(Number(body.bet));
  if (!['roulette', 'slots', 'dice'].includes(game)) return fail('Unknown game.');
  if (!Number.isSafeInteger(bet) || bet < CASINO_MIN_BET || bet > CASINO_MAX_BET) return fail(`Bet between ${CASINO_MIN_BET} and ${CASINO_MAX_BET.toLocaleString()} Bread Bucks.`);

  const result = playCasino(game, pick, (n) => randomInt(n));
  if (!result) return fail('Pick a bet first.');

  // Only applies if the balance hasn't changed since it was read, so two quick plays can't
  // both spend the same Bread Bucks.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: profile } = await database.from('profiles').select('tokens').eq('id', user.id).maybeSingle();
    const tokens = Number(profile?.tokens || 0);
    if (tokens < bet) return fail('You do not have enough Bread Bucks for that bet.');
    const payout = Math.floor(bet * result.multiplier);
    const next = Math.min(2147483647, tokens - bet + payout);
    const { data: updated, error } = await database.from('profiles').update({ tokens: next }).eq('id', user.id).eq('tokens', tokens).select('tokens');
    if (error) return fail(error.message, 500);
    if (updated?.length) return NextResponse.json({ ok: true, result, bet, payout, tokens: next });
  }
  return fail('Your balance changed while playing. Try again.', 409);
}
