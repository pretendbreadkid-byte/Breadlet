import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';
import { isKidStats, isPin, pinMatches, turnOnKidMode } from '../../../lib/kid-mode';

export const dynamic = 'force-dynamic';

const MAX_TRIES = 5;
const LOCK_MS = 15 * 60 * 1000;

// Settings > Kid mode. Turning it on sets a 4-digit grown-up PIN; turning it off needs that PIN.
export async function POST(request: Request) {
  const supabase = await createClient();
  const admin = createAdminClient();
  if (!supabase || !admin) return NextResponse.json({ error: 'Kid mode is unavailable.' }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const pin = String(body.pin || '');
  if (!isPin(pin)) return NextResponse.json({ error: 'The PIN has to be 4 numbers.' }, { status: 400 });
  const { data: profile } = await admin.from('profiles').select('stats').eq('id', user.id).maybeSingle();
  if (!profile) return NextResponse.json({ error: 'Player not found.' }, { status: 404 });
  const kid = isKidStats(profile.stats);

  if (body.action === 'on') {
    if (kid) return NextResponse.json({ error: 'Kid mode is already on.' }, { status: 400 });
    const problem = await turnOnKidMode(admin, user.id, pin);
    if (problem) return NextResponse.json({ error: problem }, { status: 409 });
    return NextResponse.json({ ok: true, kidMode: true });
  }

  if (body.action === 'off') {
    if (!kid) return NextResponse.json({ ok: true, kidMode: false });
    const { data: lock } = await admin.from('kid_mode_pins').select('pin_hash, failed_attempts, locked_until').eq('profile_id', user.id).maybeSingle();
    if (!lock) return NextResponse.json({ error: 'This kid account has no PIN. Ask Breadlet staff to turn kid mode off.' }, { status: 409 });
    const lockedFor = (Date.parse(lock.locked_until || '') || 0) - Date.now();
    if (lockedFor > 0) return NextResponse.json({ error: `Too many wrong PINs. Try again in ${Math.ceil(lockedFor / 60000)} minute(s).` }, { status: 429 });
    if (!pinMatches(pin, lock.pin_hash)) {
      const tries = (lock.failed_attempts || 0) + 1;
      await admin.from('kid_mode_pins').update(tries >= MAX_TRIES ? { failed_attempts: 0, locked_until: new Date(Date.now() + LOCK_MS).toISOString() } : { failed_attempts: tries }).eq('profile_id', user.id);
      return NextResponse.json({ error: tries >= MAX_TRIES ? 'Too many wrong PINs. Try again in 15 minutes.' : 'That PIN is wrong.' }, { status: 401 });
    }
    const { error } = await admin.from('profiles').update({ stats: { ...(profile.stats || {}), kidMode: false } }).eq('id', user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await admin.from('kid_mode_pins').delete().eq('profile_id', user.id);
    return NextResponse.json({ ok: true, kidMode: false });
  }

  return NextResponse.json({ error: 'Unknown kid mode change.' }, { status: 400 });
}
