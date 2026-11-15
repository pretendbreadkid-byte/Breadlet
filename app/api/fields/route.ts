import { randomInt } from 'crypto';
import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';
import { hasAdminAccess } from '../../../lib/admin-access';
import { DIG_TILES, PLOT_COUNT, SHOVELS_PER_HOUR, hourKey, nextHourAt, rollDigPrize, seedNamed, type DigPrize, type FieldsView, type Plot } from '../../../lib/fields';

export const dynamic = 'force-dynamic';

// Breadlet Fields (garden + dig site). Admin only while it's being tested. State lives in
// breadlet_fields (migration 0101), which players can't read, so buried prizes stay secret.
type DigState = { hour: string; buried: DigPrize[]; dug: Record<number, DigPrize> };
type State = { plots: Plot[]; dig: DigState };

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const random = () => randomInt(0, 1_000_000_000) / 1_000_000_000;
const freshDig = (): DigState => ({ hour: hourKey(), buried: Array.from({ length: DIG_TILES }, () => rollDigPrize(random)), dug: {} });

function normalize(raw: any): State {
  const plots: Plot[] = Array.from({ length: PLOT_COUNT }, (_, index) => {
    const plot = raw?.plots?.[index];
    return plot && seedNamed(plot.seed) && Number.isFinite(plot.plantedAt) ? { seed: plot.seed, plantedAt: plot.plantedAt } : null;
  });
  const dig: DigState = raw?.dig?.hour === hourKey() && Array.isArray(raw.dig.buried) ? raw.dig : freshDig();
  return { plots, dig };
}

const view = (state: State): FieldsView => ({
  plots: state.plots,
  dig: { hour: state.dig.hour, dug: state.dig.dug, shovels: Math.max(0, SHOVELS_PER_HOUR - Object.keys(state.dig.dug).length), refillsAt: nextHourAt() },
  now: Date.now(),
});

async function session() {
  const supabase = await createClient();
  const database = createAdminClient();
  if (!supabase || !database) return { response: fail('Fields are unavailable.', 503) };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { response: fail('Sign in to play.', 401) };
  if (!(await hasAdminAccess(database, user.id))) return { response: fail('Fields are not open yet.', 403) };
  return { database, userId: user.id };
}

async function load(database: any, userId: string) {
  const { data, error } = await database.from('breadlet_fields').select('state, rev').eq('profile_id', userId).maybeSingle();
  if (error) return { error: error.code === '42P01' || error.code === 'PGRST205' ? 'Apply migration 0101_breadlet_fields.sql to turn on Fields.' : error.message };
  return { state: normalize(data?.state), rev: data ? Number(data.rev) : -1 };
}

// Saves only if nobody else saved in between (two quick clicks can't both dig the same shovel).
async function save(database: any, userId: string, state: State, rev: number) {
  if (rev < 0) {
    const { error } = await database.from('breadlet_fields').insert({ profile_id: userId, state, rev: 1 });
    return !error;
  }
  const { data, error } = await database.from('breadlet_fields').update({ state, rev: rev + 1, updated_at: new Date().toISOString() }).eq('profile_id', userId).eq('rev', rev).select('profile_id');
  return !error && Boolean(data?.length);
}

async function changeTokens(database: any, userId: string, delta: number) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data: profile } = await database.from('profiles').select('tokens').eq('id', userId).maybeSingle();
    const tokens = Number(profile?.tokens || 0);
    if (tokens + delta < 0) return { error: 'You do not have enough Bread Bucks for that.' };
    const { data } = await database.from('profiles').update({ tokens: tokens + delta }).eq('id', userId).eq('tokens', tokens).select('tokens');
    if (data?.length) return { tokens: tokens + delta };
  }
  return { error: 'Your balance changed. Try again.' };
}

async function giveBreadlet(database: any, userId: string, name: string) {
  const { data: blook } = await database.from('blooks').select('id').eq('name', name).maybeSingle();
  if (!blook) return false;
  const { data: owned } = await database.from('inventory').select('id, quantity').eq('profile_id', userId).eq('blook_id', blook.id).eq('shiny', false).maybeSingle();
  const { error } = owned
    ? await database.from('inventory').update({ quantity: owned.quantity + 1 }).eq('id', owned.id)
    : await database.from('inventory').insert({ profile_id: userId, blook_id: blook.id, quantity: 1, shiny: false });
  return !error;
}

export async function GET() {
  const current = await session();
  if ('response' in current) return current.response;
  const loaded = await load(current.database, current.userId);
  if ('error' in loaded) return fail(loaded.error!, 503);
  // A new hour's board gets saved the first time it's seen, so its prizes are fixed from then on.
  if (loaded.rev < 0 || loaded.state.dig.hour !== hourKey()) await save(current.database, current.userId, loaded.state, loaded.rev);
  return NextResponse.json(view(loaded.state));
}

// POST { action: 'plant', plot, seed } | { action: 'harvest', plot } | { action: 'dig', tile }
export async function POST(request: Request) {
  const current = await session();
  if ('response' in current) return current.response;
  const { database, userId } = current;
  const body = await request.json().catch(() => ({}));
  const loaded = await load(database, userId);
  if ('error' in loaded) return fail(loaded.error!, 503);
  const { state, rev } = loaded;
  const busy = () => fail('Something changed. Try again.', 409);

  if (body.action === 'plant') {
    const index = Number(body.plot);
    const seed = seedNamed(body.seed);
    if (!Number.isInteger(index) || index < 0 || index >= PLOT_COUNT) return fail('Pick a plot.');
    if (!seed) return fail('Pick a seed.');
    if (state.plots[index]) return fail('Something is already growing there.');
    const paid = await changeTokens(database, userId, -seed.cost);
    if ('error' in paid) return fail(paid.error!);
    state.plots[index] = { seed: seed.name, plantedAt: Date.now() };
    if (!(await save(database, userId, state, rev))) {
      await changeTokens(database, userId, seed.cost);
      return busy();
    }
    return NextResponse.json({ ...view(state), tokens: paid.tokens, message: `Planted a ${seed.name}.` });
  }

  if (body.action === 'harvest') {
    const index = Number(body.plot);
    const plot = Number.isInteger(index) ? state.plots[index] : null;
    const seed = plot && seedNamed(plot.seed);
    if (!plot || !seed) return fail('Nothing is growing there.');
    if (Date.now() < plot.plantedAt + seed.growMs) return fail(`Your ${seed.name} isn't ready yet.`);
    state.plots[index] = null;
    if (!(await save(database, userId, state, rev))) return busy();
    const paid = await changeTokens(database, userId, seed.payout);
    const lucky = random() < seed.breadletChance && (await giveBreadlet(database, userId, seed.name));
    return NextResponse.json({
      ...view(state),
      tokens: 'tokens' in paid ? paid.tokens : undefined,
      breadlet: lucky ? seed.name : undefined,
      message: lucky ? `WOW! You grew a ${seed.name} Breadlet, plus ${seed.payout} Bread Bucks!` : `Harvested a ${seed.name} for ${seed.payout} Bread Bucks.`,
    });
  }

  if (body.action === 'dig') {
    const tile = Number(body.tile);
    if (!Number.isInteger(tile) || tile < 0 || tile >= DIG_TILES) return fail('Pick a spot to dig.');
    if (state.dig.dug[tile]) return fail('You already dug there.');
    if (Object.keys(state.dig.dug).length >= SHOVELS_PER_HOUR) return fail('Out of shovels. More next hour!');
    const prize = state.dig.buried[tile] || { kind: 'nothing' };
    state.dig.dug = { ...state.dig.dug, [tile]: prize };
    if (!(await save(database, userId, state, rev))) return busy();
    let tokens: number | undefined;
    let message = 'Just dirt. Try another spot!';
    if (prize.kind === 'tokens') {
      const paid = await changeTokens(database, userId, prize.amount);
      tokens = 'tokens' in paid ? paid.tokens : undefined;
      message = `Dug up ${prize.amount} Bread Bucks!`;
    } else if (prize.kind === 'breadlet') {
      message = (await giveBreadlet(database, userId, prize.name)) ? `WOW! You dug up a ${prize.name}!` : `You found a ${prize.name}, but it crumbled. Tell an admin.`;
    }
    return NextResponse.json({ ...view(state), tokens, breadlet: prize.kind === 'breadlet' ? prize.name : undefined, message });
  }

  return fail('Unknown action.');
}
