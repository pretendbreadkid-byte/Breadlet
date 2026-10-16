import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { GET as getPlayer } from '../../player/route';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const client = await createClient();
  if (!client) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const authorization = request.headers.get('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
  const { data: { user } } = await client.auth.getUser(token);
  if (!user) return NextResponse.json({ error: 'Sign in again to continue playing.' }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Gameplay server is not configured.' }, { status: 503 });
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('is_banned, account_status')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) return NextResponse.json({ error: 'Could not load your player profile.' }, { status: 503 });
  if (!profile) return NextResponse.json({ error: 'Player profile not found.' }, { status: 404 });
  if (profile.is_banned || profile.account_status !== 'active') {
    return NextResponse.json({ error: 'This account cannot play.' }, { status: 403 });
  }

  const { data: result, error } = await admin.rpc('record_ted_secret_click', { p_profile_id: user.id });
  if (error) {
    const missing = error.code === 'PGRST202' || error.code === '42883';
    return NextResponse.json(
      { error: missing ? 'Apply supabase/migrations/0017_ted_secret.sql to enable Ted’s secret.' : error.message },
      { status: missing ? 503 : 409 },
    );
  }

  const secretResult = result as { triggered?: boolean; claimed?: boolean } | null;
  if (!secretResult?.triggered || !secretResult.claimed) {
    return NextResponse.json({
      triggered: Boolean(secretResult?.triggered),
      claimed: false,
    });
  }
  const state = await getPlayer(request);
  if (!state.ok) return state;
  return NextResponse.json({ player: await state.json(), triggered: true, claimed: true });
}
