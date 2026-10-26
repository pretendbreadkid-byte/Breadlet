import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';

export const dynamic = 'force-dynamic';

const LIMIT = 300;
const names = (value: unknown) => Array.isArray(value)
  ? Array.from(new Set(value.map((name) => String(name || '').trim().slice(0, 60)).filter(Boolean))).slice(0, LIMIT)
  : null;

// Saves the player's locked Breadlets ({ lockedBlooks }) or Bazaar wishlist ({ wishlist }).
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
  return NextResponse.json({ ok: true });
}
