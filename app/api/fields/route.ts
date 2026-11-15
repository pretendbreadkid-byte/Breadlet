import { randomInt } from 'crypto';
import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';
import { hasAdminAccess } from '../../../lib/admin-access';
import { isKidAccount } from '../../../lib/kid-mode';
import { DAILY_EARN_LIMIT, MAX_BASKET, MAX_HELPERS, MAX_SEEDS_PER_BUY, MAX_SIZE, MIN_SIZE, PLOT_COUNT, SEEDS, cropValue, gardenDay, rollSize, seedNamed, sizeLabel, type Crop, type FieldsView, type GardenPerson, type Plot, type SeedName } from '../../../lib/fields';

export const dynamic = 'force-dynamic';

// Breadlet Garden. Every player has a garden (a row in breadlet_fields, migration 0101, which only
// the server can read or write). Owning a garden is admin only while it's tested; anyone signed in
// (not a kid account) can visit one from an invite link, and plant there if the owner allows it.
// earned: Bread Bucks this player earned from gardens on that day (it lives in their own row).
// crops: the basket of harvested crops waiting to be sold or given away.
type State = { plots: Plot[]; seeds: Record<SeedName, number>; helpers: string[]; earned: { day: string; amount: number }; crops: Crop[] };

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const random = () => randomInt(0, 1_000_000_000) / 1_000_000_000;
const isId = (value: unknown) => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value);
const isSize = (value: unknown) => typeof value === 'number' && value >= MIN_SIZE && value <= MAX_SIZE;
const newCropId = () => `${Date.now().toString(36)}${randomInt(0, 2 ** 32).toString(36)}`;

function normalize(raw: any): State {
  const plots: Plot[] = Array.from({ length: PLOT_COUNT }, (_, index) => {
    const plot = raw?.plots?.[index];
    if (!plot || !seedNamed(plot.seed) || !Number.isFinite(plot.plantedAt)) return null;
    return { seed: plot.seed, plantedAt: plot.plantedAt, plantedBy: isId(plot.plantedBy) ? plot.plantedBy : undefined, plantedByName: typeof plot.plantedByName === 'string' ? plot.plantedByName.slice(0, 40) : undefined, size: isSize(plot.size) ? plot.size : undefined };
  });
  const seeds = Object.fromEntries(SEEDS.map((seed) => [seed.name, Math.max(0, Math.floor(Number(raw?.seeds?.[seed.name]) || 0))])) as Record<SeedName, number>;
  const helpers = Array.isArray(raw?.helpers) ? raw.helpers.filter(isId).slice(0, MAX_HELPERS) : [];
  const earned = { day: typeof raw?.earned?.day === 'string' ? raw.earned.day : '', amount: Math.max(0, Math.floor(Number(raw?.earned?.amount) || 0)) };
  const crops: Crop[] = (Array.isArray(raw?.crops) ? raw.crops : [])
    .filter((crop: any) => crop && typeof crop.id === 'string' && seedNamed(crop.seed) && isSize(crop.size))
    .slice(0, MAX_BASKET)
    .map((crop: any) => ({ id: crop.id.slice(0, 40), seed: crop.seed, size: crop.size, from: typeof crop.from === 'string' ? crop.from.slice(0, 40) : undefined }));
  return { plots, seeds, helpers, earned, crops };
}

async function session(gardenParam: unknown) {
  const supabase = await createClient();
  const database = createAdminClient();
  if (!supabase || !database) return { response: fail('The garden is unavailable.', 503) };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { response: fail('Sign in to visit gardens.', 401) };
  const ownerId = isId(gardenParam) ? String(gardenParam) : user.id;
  if (ownerId === user.id) {
    if (!(await hasAdminAccess(database, user.id))) return { response: fail('Gardens are not open yet.', 403) };
  } else if (await isKidAccount(user.id, database)) {
    return { response: fail("Kid accounts can't visit other gardens.", 403) };
  }
  const { data: people } = await database.from('profiles').select('id, username').in('id', ownerId === user.id ? [user.id] : [user.id, ownerId]);
  const owner = (people || []).find((row: any) => row.id === ownerId);
  const viewer = (people || []).find((row: any) => row.id === user.id);
  if (!owner) return { response: fail('That garden does not exist.', 404) };
  return { database, userId: user.id, username: String(viewer?.username || 'Player'), owner: { id: owner.id, username: String(owner.username || 'Player') } as GardenPerson };
}

async function load(database: any, profileId: string) {
  const { data, error } = await database.from('breadlet_fields').select('state, rev').eq('profile_id', profileId).maybeSingle();
  if (error) return { error: error.code === '42P01' || error.code === 'PGRST205' ? 'Apply migration 0101_breadlet_fields.sql to turn on the garden.' : error.message };
  return { state: normalize(data?.state), rev: data ? Number(data.rev) : -1 };
}

// Saves only if nobody else saved in between, so two quick clicks can't both use the same seed.
async function save(database: any, profileId: string, state: State, rev: number) {
  if (rev < 0) {
    const { error } = await database.from('breadlet_fields').insert({ profile_id: profileId, state, rev: 1 });
    return !error;
  }
  const { data, error } = await database.from('breadlet_fields').update({ state, rev: rev + 1, updated_at: new Date().toISOString() }).eq('profile_id', profileId).eq('rev', rev).select('profile_id');
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

const earnedToday = (state: State) => (state.earned.day === gardenDay() ? state.earned.amount : 0);

async function buildView(database: any, current: { userId: string; owner: GardenPerson }, garden: State, mine: State): Promise<FieldsView> {
  const isOwner = current.owner.id === current.userId;
  let helpers: GardenPerson[] = [];
  if (isOwner && garden.helpers.length) {
    const { data } = await database.from('profiles').select('id, username').in('id', garden.helpers);
    helpers = (data || []).map((row: any) => ({ id: row.id, username: String(row.username || 'Player') }));
  }
  return { owner: current.owner, isOwner, canPlant: isOwner || garden.helpers.includes(current.userId), helpers, plots: garden.plots, seeds: mine.seeds, crops: mine.crops, earnedToday: earnedToday(mine), now: Date.now() };
}

// GET ?garden=<owner id> (no garden = your own).
export async function GET(request: Request) {
  const current = await session(new URL(request.url).searchParams.get('garden'));
  if ('response' in current) return current.response;
  const garden = await load(current.database, current.owner.id);
  if ('error' in garden) return fail(garden.error!, 503);
  const mine = current.owner.id === current.userId ? garden : await load(current.database, current.userId);
  if ('error' in mine) return fail(mine.error!, 503);
  return NextResponse.json(await buildView(current.database, current, garden.state, mine.state));
}

// POST { garden?, action: 'buy', seed, amount } | { garden?, action: 'plant', plot, seed }
//    | { garden?, action: 'harvest', plot } | { action: 'permit', profileId, allow }  (owner only)
//    | { action: 'sell', crop } | { action: 'sell', all: true } | { action: 'give', crop, profileId }
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const current = await session(body.garden);
  if ('response' in current) return current.response;
  const { database, userId, owner } = current;
  const isOwner = owner.id === userId;
  const garden = await load(database, owner.id);
  if ('error' in garden) return fail(garden.error!, 503);
  const mine = isOwner ? garden : await load(database, userId);
  if ('error' in mine) return fail(mine.error!, 503);
  const busy = () => fail('Something changed. Try again.', 409);
  const respond = async (extra: Record<string, unknown>) => NextResponse.json({ ...(await buildView(database, current, garden.state, mine.state)), ...extra });

  if (body.action === 'permit') {
    if (!isOwner) return fail('Only the garden owner can do that.', 403);
    if (!isId(body.profileId) || body.profileId === userId) return fail('Pick a player.');
    const helpers = garden.state.helpers.filter((id) => id !== body.profileId);
    if (body.allow) {
      if (helpers.length >= MAX_HELPERS) return fail(`You can let up to ${MAX_HELPERS} players plant.`);
      helpers.push(body.profileId);
    }
    garden.state.helpers = helpers;
    if (!(await save(database, owner.id, garden.state, garden.rev))) return busy();
    return respond({ message: body.allow ? 'They can plant in your garden now.' : 'They can no longer plant in your garden.' });
  }

  if (body.action === 'buy') {
    const seed = seedNamed(body.seed);
    const amount = Math.floor(Number(body.amount));
    if (!seed) return fail('Pick a seed.');
    if (!Number.isInteger(amount) || amount < 1 || amount > MAX_SEEDS_PER_BUY) return fail(`Buy 1 to ${MAX_SEEDS_PER_BUY} seeds at a time.`);
    const paid = await changeTokens(database, userId, -seed.cost * amount);
    if ('error' in paid) return fail(paid.error!);
    mine.state.seeds[seed.name] += amount;
    if (!(await save(database, userId, mine.state, mine.rev))) {
      await changeTokens(database, userId, seed.cost * amount);
      return busy();
    }
    return respond({ tokens: paid.tokens, message: `Bought ${amount} ${seed.name} seed${amount === 1 ? '' : 's'}.` });
  }

  if (body.action === 'plant') {
    const index = Number(body.plot);
    const seed = seedNamed(body.seed);
    if (!isOwner && !garden.state.helpers.includes(userId)) return fail(`Ask ${owner.username} to let you plant here.`, 403);
    if (!Number.isInteger(index) || index < 0 || index >= PLOT_COUNT) return fail('Pick a plot.');
    if (!seed) return fail('Pick a seed.');
    if (garden.state.plots[index]) return fail('Something is already growing there.');
    if (mine.state.seeds[seed.name] < 1) return fail(`You have no ${seed.name} seeds. Buy some at Ted's Seed Stand.`);
    // The seed comes out of your pouch first; if the plot can't be saved, it goes back.
    mine.state.seeds[seed.name] -= 1;
    if (!isOwner && !(await save(database, userId, mine.state, mine.rev))) return busy();
    garden.state.plots[index] = { seed: seed.name, plantedAt: Date.now(), plantedBy: userId, plantedByName: current.username, size: rollSize(random()) };
    if (!(await save(database, owner.id, garden.state, garden.rev))) {
      if (!isOwner) {
        const refund = await load(database, userId);
        if (!('error' in refund)) { refund.state.seeds[seed.name] += 1; await save(database, userId, refund.state, refund.rev); }
      }
      return busy();
    }
    return respond({ message: `Planted a ${seed.name}.` });
  }

  // Saves a change to your own row. In your own garden that's the garden row too. If something else
  // saved in between, it reloads and tries again. Returns an error message, or '' when it worked.
  const saveMine = async (change: (state: State) => string | void) => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const fresh = attempt === 0 ? mine : await load(database, userId);
      if ('error' in fresh) return fresh.error!;
      const problem = change(fresh.state);
      if (problem) return problem;
      if (await save(database, userId, fresh.state, fresh.rev)) {
        mine.state = fresh.state;
        if (isOwner) garden.state = fresh.state;
        return '';
      }
    }
    return 'Something changed. Try again.';
  };

  if (body.action === 'harvest') {
    const index = Number(body.plot);
    const plot = Number.isInteger(index) ? garden.state.plots[index] : null;
    const seed = plot && seedNamed(plot.seed);
    if (!plot || !seed) return fail('Nothing is growing there.');
    // Whoever planted it harvests it (crops from before helpers existed belong to the owner).
    const planter = plot.plantedBy || owner.id;
    if (planter !== userId) return fail(`That's ${plot.plantedByName || owner.username}'s ${seed.name}. Only they can harvest it.`, 403);
    if (Date.now() < plot.plantedAt + seed.growMs) return fail(`Your ${seed.name} isn't ready yet.`);
    if (mine.state.crops.length >= MAX_BASKET) return fail(`Your basket is full (${MAX_BASKET} crops). Sell or give some away first.`);
    const crop: Crop = { id: newCropId(), seed: seed.name, size: plot.size ?? rollSize(random()) };
    // Your own garden: one save clears the plot and fills your basket. A friend's: their plot first, then your basket.
    garden.state.plots[index] = null;
    if (isOwner) {
      garden.state.crops.push(crop);
      if (!(await save(database, owner.id, garden.state, garden.rev))) return busy();
    } else {
      if (!(await save(database, owner.id, garden.state, garden.rev))) return busy();
      const problem = await saveMine((state) => { state.crops.push(crop); });
      if (problem) return fail(problem, 409);
    }
    const lucky = random() < seed.breadletChance && (await giveBreadlet(database, userId, seed.name));
    const what = `${sizeLabel(crop.size)} ${seed.name} (${crop.size}x)`;
    return respond({
      breadlet: lucky ? seed.name : undefined,
      crop,
      message: lucky ? `WOW! You grew a ${seed.name} Breadlet, and a ${what} went in your basket!` : `A ${what} went in your basket. It sells for ${cropValue(seed.name, crop.size)}.`,
    });
  }

  // Sell one crop, or the whole basket. The daily garden limit counts here now, not at harvest.
  if (body.action === 'sell') {
    let pay = 0;
    let sold = 0;
    let left = 0;
    const problem = await saveMine((state) => {
      const already = earnedToday(state);
      let room = DAILY_EARN_LIMIT - already;
      if (room <= 0) return `You've hit today's ${DAILY_EARN_LIMIT.toLocaleString()} Bread Bucks garden limit. Your crops will keep until tomorrow.`;
      const picked = body.all ? state.crops.map((crop) => crop.id) : [String(body.crop || '')];
      if (!body.all && !state.crops.some((crop) => crop.id === picked[0])) return 'That crop is not in your basket.';
      pay = 0;
      sold = 0;
      const keep: Crop[] = [];
      for (const crop of state.crops) {
        if (picked.includes(crop.id) && room > 0) {
          const value = Math.min(room, cropValue(crop.seed, crop.size));
          pay += value;
          room -= value;
          sold += 1;
        } else keep.push(crop);
      }
      if (!sold) return 'Your basket is empty.';
      left = keep.length;
      state.crops = keep;
      state.earned = { day: gardenDay(), amount: already + pay };
    });
    if (problem) return fail(problem);
    const paid = await changeTokens(database, userId, pay);
    const capped = earnedToday(mine.state) >= DAILY_EARN_LIMIT;
    return respond({
      tokens: 'tokens' in paid ? paid.tokens : undefined,
      payout: pay,
      message: `Sold ${sold} crop${sold === 1 ? '' : 's'} for ${pay} Bread Bucks.`
        + (capped ? ` That's today's ${DAILY_EARN_LIMIT.toLocaleString()} limit${body.all && left ? `, so ${left} crop${left === 1 ? '' : 's'} stayed in your basket` : ''}.` : ''),
    });
  }

  // Give a crop from your basket to another player.
  if (body.action === 'give') {
    const to = body.profileId;
    if (!isId(to) || to === userId) return fail('Pick a player to give it to.');
    const crop = mine.state.crops.find((item) => item.id === String(body.crop || ''));
    if (!crop) return fail('That crop is not in your basket.');
    const { data: friend } = await database.from('profiles').select('id, username').eq('id', to).maybeSingle();
    if (!friend) return fail('That player does not exist.');
    if (await isKidAccount(to, database)) return fail("Kid accounts can't get gifts.", 403);
    const theirs = await load(database, to);
    if ('error' in theirs) return fail(theirs.error!, 503);
    if (theirs.state.crops.length >= MAX_BASKET) return fail(`${friend.username}'s basket is full.`);
    // Out of your basket first; if theirs can't be saved, it comes back.
    const taken = await saveMine((state) => {
      if (!state.crops.some((item) => item.id === crop.id)) return 'That crop is not in your basket.';
      state.crops = state.crops.filter((item) => item.id !== crop.id);
    });
    if (taken) return fail(taken, 409);
    let given = false;
    let target = theirs;
    for (let attempt = 0; attempt < 4 && !given; attempt += 1) {
      if (attempt) {
        const fresh = await load(database, to);
        if ('error' in fresh) break;
        target = fresh;
      }
      if (target.state.crops.length >= MAX_BASKET) break;
      target.state.crops.push({ ...crop, id: newCropId(), from: current.username });
      given = await save(database, to, target.state, target.rev);
      if (!given) target.state.crops.pop();
    }
    if (!given) {
      await saveMine((state) => { state.crops.push(crop); });
      return fail(`Couldn't give it to ${friend.username}. Try again.`, 409);
    }
    // In their garden, the garden you see is their row, so show the change.
    if (owner.id === to) garden.state = target.state;
    return respond({ message: `You gave your ${sizeLabel(crop.size)} ${crop.seed} to ${friend.username}!` });
  }

  return fail('Unknown action.');
}
