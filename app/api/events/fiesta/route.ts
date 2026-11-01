import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { FIESTA_SHOP, LEAVES_PER_SHOWER, SHOWER_MINUTES, showerAt } from '../../../../lib/fall-fiesta';

export const dynamic = 'force-dynamic';

// What Supabase answers until migration 0071 has been run.
const NOT_INSTALLED = new Set(['PGRST202', 'PGRST205', '42883', '42P01']);
const notReady = () => NextResponse.json({ ready: false, leaves: 0, caught: 0, bought: [], adminEndsAt: null });

const signedIn = async () => {
  const supabase = await createClient();
  const database = createAdminClient();
  if (!supabase || !database) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user ? { user, database } : null;
};

// The player's leaves, what they caught in this hour's shower and what they already bought.
export async function GET() {
  const session = await signedIn();
  if (!session) return NextResponse.json({ error: 'Log in to join the Fall Fiesta.' }, { status: 401 });
  const { user, database } = session;
  // A running admin shower replaces the hourly one, like in catch_fall_leaf (migration 0073).
  const { data: adminShowers } = await database.from('admin_events').select('created_at, ends_at')
    .eq('kind', 'leaf_shower').gt('ends_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1);
  const adminShower = adminShowers?.[0];
  const [wallet, shower] = await Promise.all([
    database.from('fall_fiesta_wallets').select('leaves, bought').eq('profile_id', user.id).maybeSingle(),
    database.from('fall_fiesta_showers').select('catches').eq('profile_id', user.id)
      .eq('shower_at', adminShower?.created_at || new Date(showerAt(Date.now()).startsAt).toISOString()).maybeSingle(),
  ]);
  if (wallet.error || shower.error) {
    if (NOT_INSTALLED.has(wallet.error?.code || '') || NOT_INSTALLED.has(shower.error?.code || '')) return notReady();
    return NextResponse.json({ error: 'Could not load your leaves.' }, { status: 503 });
  }
  return NextResponse.json({ ready: true, leaves: wallet.data?.leaves || 0, caught: shower.data?.catches || 0, bought: wallet.data?.bought || [], adminEndsAt: adminShower ? Date.parse(adminShower.ends_at) : null });
}

// Catch one leaf during a shower, or buy something from the leaf shop.
export async function POST(request: Request) {
  const session = await signedIn();
  if (!session) return NextResponse.json({ error: 'Log in to join the Fall Fiesta.' }, { status: 401 });
  const { user, database } = session;
  const body = await request.json().catch(() => ({}));

  let call;
  if (body.action === 'catch') {
    call = database.rpc('catch_fall_leaf', { p_profile_id: user.id, p_minutes: SHOWER_MINUTES, p_limit: LEAVES_PER_SHOWER });
  } else if (body.action === 'buy') {
    const item = FIESTA_SHOP.find((entry) => entry.name === body.item);
    if (!item) return NextResponse.json({ error: 'That is not in the leaf shop.' }, { status: 400 });
    call = database.rpc('buy_fall_reward', { p_profile_id: user.id, p_item: item.name, p_price: item.price, p_badge: Boolean(item.badge) });
  } else {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  const { data, error } = await call;
  if (error) {
    if (NOT_INSTALLED.has(error.code)) return NextResponse.json({ error: 'The Fall Fiesta is still being set up.' }, { status: 503 });
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  return NextResponse.json(data);
}
