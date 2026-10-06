import { randomInt } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';
import { planGameplay } from '../../../lib/gameplay-actions';
import type { GameplaySnapshot } from '../../../lib/gameplay-actions';
import { GET as getPlayer } from '../player/route';

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
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid gameplay request.' }, { status: 400 });
  const [{ data: profile, error: profileError }, { data: inventory, error: inventoryError }, { data: catalog, error: catalogError }] = await Promise.all([
    admin.from('profiles').select('tokens, materials, stats, is_banned, account_status').eq('id', user.id).single(),
    admin.from('inventory').select('quantity, shiny, blooks(id, name, rarity)').eq('profile_id', user.id),
    admin.from('blooks').select('id, name'),
  ]);
  if (profileError || inventoryError || catalogError || !profile) return NextResponse.json({ error: 'Could not load your current game state.' }, { status: 503 });
  if (profile.is_banned || profile.account_status !== 'active') return NextResponse.json({ error: 'This account cannot play.' }, { status: 403 });
  const snapshot: GameplaySnapshot = {
    tokens: profile.tokens,
    materials: profile.materials || {},
    inventory: {},
    wheelSpun: typeof profile.stats?.wheelSpunAt === 'string' && profile.stats.wheelSpunAt.slice(0, 10) === new Date().toISOString().slice(0, 10),
  };
  for (const row of inventory || []) {
    const blook = row.blooks as unknown as { id: string; name: string; rarity: string } | null;
    if (blook) snapshot.inventory[`${row.shiny ? 'Shiny ' : ''}${blook.name}`] = { quantity: row.quantity, rarity: blook.rarity };
  }
  try {
    const plan = planGameplay(body, snapshot, () => randomInt(0, 1000000000) / 1000000000);
    const ids = new Map((catalog || []).map((entry) => [entry.name, entry.id]));
    const deltas = Object.entries(plan.inventoryDelta).map(([name, quantity]) => {
      const id = ids.get(name.replace(/^Shiny /, ''));
      if (!id) throw new Error(`${name} is missing from the server catalog. Apply migration 0015_secure_gameplay.sql.`);
      return { blook_id: id, quantity, shiny: name.startsWith('Shiny ') };
    });
    const { error } = await admin.rpc('apply_gameplay_action', {
      p_profile_id: user.id,
      p_revision: Number(profile.stats?.gameplayRevision) || 0,
      p_action: plan.action,
      p_token_delta: plan.tokenDelta,
      p_inventory_delta: deltas,
      p_material_delta: plan.materialDelta,
      p_candy_delta: plan.candyDelta,
      p_capsules_opened: plan.capsulesOpened,
    });
    if (error) {
      const missing = error.code === 'PGRST202' || error.code === '42883';
      return NextResponse.json({ error: missing ? 'Apply supabase/migrations/0015_secure_gameplay.sql to enable protected gameplay.' : error.message }, { status: missing ? 503 : 409 });
    }
    const state = await getPlayer(request);
    if (!state.ok) return state;
    const player = await state.json();
    return NextResponse.json({ player, results: plan.results, crateReward: plan.crateReward, sold: plan.sold, tokensEarned: plan.tokensEarned, tokens: player.profile.tokens });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid gameplay action.' }, { status: 400 });
  }
}