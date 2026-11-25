import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { cleanBirthday } from '../../../../lib/og-badge';

export const dynamic = 'force-dynamic';

const LIMIT = 300;
const names = (value: unknown) => Array.isArray(value)
  ? Array.from(new Set(value.map((name) => String(name || '').trim().slice(0, 60)).filter(Boolean))).slice(0, LIMIT)
  : null;

// Saves the player's locked Breadlets ({ lockedBlooks }), Bazaar wishlist ({ wishlist }), whether
// their badges are hidden ({ hideBadges }) or who they blocked ({ blockedPlayers: [{ id, username }] }).
const isId = (value: unknown) => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value);
export async function POST(request: Request) {
  const supabase = await createClient();
  const admin = createAdminClient();
  if (!supabase || !admin) return NextResponse.json({ error: 'Saving is unavailable.' }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in to save this.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  for (const key of ['lockedBlooks', 'wishlist'] as const) {
    if (!(key in body)) continue;
    const value = names(body[key]);
    if (!value) return NextResponse.json({ error: 'Invalid list.' }, { status: 400 });
    const { error } = await admin.rpc('set_player_pref', { p_profile_id: user.id, p_key: key, p_value: value });
    if (error) return NextResponse.json({ error: error.code === 'PGRST202' ? 'Run migration 0064 to save this.' : error.message }, { status: 500 });
  }
  if ('hideBadges' in body) {
    const { error } = await admin.rpc('set_player_pref', { p_profile_id: user.id, p_key: 'hideBadges', p_value: body.hideBadges === true });
    if (error) return NextResponse.json({ error: error.message.includes('Invalid preference') ? 'Run migration 0105 to save this.' : error.message }, { status: 500 });
  }
  if ('blockedPlayers' in body) {
    if (!Array.isArray(body.blockedPlayers)) return NextResponse.json({ error: 'Invalid list.' }, { status: 400 });
    const seen = new Set<string>();
    const list = body.blockedPlayers
      .filter((entry: any) => isId(entry?.id) && entry.id !== user.id && !seen.has(entry.id) && seen.add(entry.id))
      .slice(0, LIMIT)
      .map((entry: any) => ({ id: entry.id, username: String(entry.username || 'Player').slice(0, 40) }));
    const { error } = await admin.rpc('set_player_pref', { p_profile_id: user.id, p_key: 'blockedPlayers', p_value: list });
    if (error) return NextResponse.json({ error: error.message.includes('Invalid preference') ? 'Run migration 0105 to save this.' : error.message }, { status: 500 });
  }
  // Birthday (for the Birthday badge) can only be set once, so it can't be moved to today.
  if ('birthday' in body) {
    const birthday = cleanBirthday(body.birthday);
    if (!birthday) return NextResponse.json({ error: 'Pick a real birthday (month and day).' }, { status: 400 });
    const { data: profile } = await admin.from('profiles').select('stats').eq('id', user.id).maybeSingle();
    if (!profile) return NextResponse.json({ error: 'Player not found.' }, { status: 404 });
    if (profile.stats?.birthday) return NextResponse.json({ error: 'Your birthday is already set. Ask an admin if it is wrong.' }, { status: 409 });
    const { error } = await admin.from('profiles').update({ stats: { ...(profile.stats || {}), birthday } }).eq('id', user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
