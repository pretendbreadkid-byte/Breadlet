import { randomInt } from 'crypto';
import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';
import { hasAdminAccess } from '../../../lib/admin-access';
import { isKidAccount } from '../../../lib/kid-mode';
import { BLOCKED_MESSAGE, isBlockedBetween } from '../../../lib/blocks';
import {
  DAILY_EARN_LIMIT, MAX_BASKET, MAX_HELPERS, MAX_PLANTS, MAX_PROPS, MAX_SEEDS_PER_BUY, MAX_SIZE, MIN_SIZE, PLANT_GAP, PROPS, ROWS, SEEDS,
  canPlaceProp, cropValue, gardenDay, inRow, propNamed, rollSize, seedNamed, sizeLabel,
  type Crop, type FieldsView, type GardenPerson, type PlacedProp, type Plant, type PropKind, type SeedName,
} from '../../../lib/fields';

export const dynamic = 'force-dynamic';

// Breadlet Garden. Every player has a garden (a row in breadlet_fields, migration 0101, which only
// the server can read or write). Owning a garden is admin only while it's tested; anyone signed in
// (not a kid account, not blocked) can visit one from an invite link, plant there if the owner lets
// them (helpers) and place props if the owner lets them build (builders).
// Your own row also holds your seed pouch, basket of crops, bag of props and what you earned today.
type State = {
  plants: Plant[];
  props: PlacedProp[];
  seeds: Record<SeedName, number>;
  propBag: Record<PropKind, number>;
  helpers: string[];
  builders: string[];
  earned: { day: string; amount: number };
  crops: Crop[];
};

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const random = () => randomInt(0, 1_000_000_000) / 1_000_000_000;
const isId = (value: unknown) => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value);
const isSize = (value: unknown) => typeof value === 'number' && value >= MIN_SIZE && value <= MAX_SIZE;
const newId = () => `${Date.now().toString(36)}${randomInt(0, 2 ** 32).toString(36)}`;
const name = (value: unknown) => (typeof value === 'string' ? value.slice(0, 40) : undefined);
const count = (value: unknown) => Math.max(0, Math.floor(Number(value) || 0));

// Gardens from before the rows had 9 beds: their crops move onto the rows, evenly spaced.
const oldBedSpot = (index: number) => {
  const row = ROWS[index < 5 ? 0 : 1];
  const slot = index < 5 ? index : index - 5;
  return { x: row.x + 90 + slot * ((row.width - 180) / 4), y: row.y + row.height / 2 + 30 };
};

function normalize(raw: any): State {
  const fromBeds = !Array.isArray(raw?.plants) && Array.isArray(raw?.plots)
    ? raw.plots.map((plot: any, index: number) => plot && { ...plot, id: newId(), ...oldBedSpot(index) }).filter(Boolean)
    : [];
  const plants: Plant[] = (Array.isArray(raw?.plants) ? raw.plants : fromBeds)
    .filter((plant: any) => plant && typeof plant.id === 'string' && seedNamed(plant.seed) && Number.isFinite(plant.plantedAt) && Number.isFinite(plant.x) && Number.isFinite(plant.y))
    .slice(0, MAX_PLANTS)
    .map((plant: any) => ({ id: plant.id.slice(0, 40), seed: plant.seed, x: plant.x, y: plant.y, plantedAt: plant.plantedAt, plantedBy: isId(plant.plantedBy) ? plant.plantedBy : undefined, plantedByName: name(plant.plantedByName), size: isSize(plant.size) ? plant.size : undefined }));
  const props: PlacedProp[] = (Array.isArray(raw?.props) ? raw.props : [])
    .filter((prop: any) => prop && typeof prop.id === 'string' && propNamed(prop.kind) && Number.isFinite(prop.x) && Number.isFinite(prop.y))
    .slice(0, MAX_PROPS)
    .map((prop: any) => ({ id: prop.id.slice(0, 40), kind: prop.kind, x: prop.x, y: prop.y, by: isId(prop.by) ? prop.by : undefined, byName: name(prop.byName) }));
  const seeds = Object.fromEntries(SEEDS.map((seed) => [seed.name, count(raw?.seeds?.[seed.name])])) as Record<SeedName, number>;
  const propBag = Object.fromEntries(PROPS.map((prop) => [prop.kind, count(raw?.propBag?.[prop.kind])])) as Record<PropKind, number>;
  const people = (list: unknown) => (Array.isArray(list) ? list.filter(isId).slice(0, MAX_HELPERS) : []);
  const earned = { day: typeof raw?.earned?.day === 'string' ? raw.earned.day : '', amount: count(raw?.earned?.amount) };
  const crops: Crop[] = (Array.isArray(raw?.crops) ? raw.crops : [])
    .filter((crop: any) => crop && typeof crop.id === 'string' && seedNamed(crop.seed) && isSize(crop.size))
    .slice(0, MAX_BASKET)
    .map((crop: any) => ({ id: crop.id.slice(0, 40), seed: crop.seed, size: crop.size, from: name(crop.from) }));
  return { plants, props, seeds, propBag, helpers: people(raw?.helpers), builders: people(raw?.builders), earned, crops };
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
  } else if (await isBlockedBetween(database, user.id, ownerId)) {
    return { response: fail("You can't visit this garden.", 403) };
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

// Changes someone's row, reloading and trying again if something else saved in between.
// change returns an error message to stop. Returns the saved state, or an error.
async function update(database: any, profileId: string, change: (state: State) => string | void, first?: { state: State; rev: number }) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const fresh = attempt === 0 && first ? first : await load(database, profileId);
    if ('error' in fresh) return { error: fresh.error! };
    const problem = change(fresh.state);
    if (problem) return { error: problem, stop: true };
    if (await save(database, profileId, fresh.state, fresh.rev)) return { state: fresh.state, rev: fresh.rev + 1 };
  }
  return { error: 'Something changed. Try again.' };
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

async function giveBreadlet(database: any, userId: string, breadlet: string) {
  const { data: blook } = await database.from('blooks').select('id').eq('name', breadlet).maybeSingle();
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
  let builders: GardenPerson[] = [];
  const ids = Array.from(new Set([...garden.helpers, ...garden.builders]));
  if (isOwner && ids.length) {
    const { data } = await database.from('profiles').select('id, username').in('id', ids);
    const people = (data || []).map((row: any) => ({ id: row.id, username: String(row.username || 'Player') }));
    helpers = people.filter((person: GardenPerson) => garden.helpers.includes(person.id));
    builders = people.filter((person: GardenPerson) => garden.builders.includes(person.id));
  }
  return {
    owner: current.owner, isOwner,
    canPlant: isOwner || garden.helpers.includes(current.userId),
    canBuild: isOwner || garden.builders.includes(current.userId),
    helpers, builders, plants: garden.plants, props: garden.props,
    seeds: mine.seeds, crops: mine.crops, propBag: mine.propBag, earnedToday: earnedToday(mine), now: Date.now(),
  };
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

// POST, all with { garden? }:
//   { action: 'buy', seed, amount } | { action: 'plant', seed, x, y } | { action: 'harvest', plant }
//   { action: 'sell', crop } | { action: 'sell', all: true } | { action: 'give', crop, profileId }
//   { action: 'buyProp', kind } | { action: 'place', kind, x, y } | { action: 'pickUp', prop }
//   { action: 'permit', profileId, role: 'plant' | 'build', allow }  (owner only)
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const current = await session(body.garden);
  if ('response' in current) return current.response;
  const { database, userId, owner } = current;
  const isOwner = owner.id === userId;
  const gardenRow = await load(database, owner.id);
  if ('error' in gardenRow) return fail(gardenRow.error!, 503);
  const mineRow = isOwner ? gardenRow : await load(database, userId);
  if ('error' in mineRow) return fail(mineRow.error!, 503);
  // What the response shows; updated as rows are saved.
  let garden = gardenRow.state;
  let mine = mineRow.state;
  const respond = async (extra: Record<string, unknown>) => NextResponse.json({ ...(await buildView(database, current, garden, mine)), ...extra });

  // Saves your own row (in your own garden that's the garden too).
  const updateMine = async (change: (state: State) => string | void) => {
    const result = await update(database, userId, change, mineRow);
    if ('state' in result && result.state) {
      mine = result.state;
      if (isOwner) garden = result.state;
    }
    return result.error || '';
  };
  // Saves the garden's row.
  const updateGarden = async (change: (state: State) => string | void) => {
    const result = await update(database, owner.id, change, gardenRow);
    if ('state' in result && result.state) {
      garden = result.state;
      if (isOwner) mine = result.state;
    }
    return result.error || '';
  };

  if (body.action === 'permit') {
    if (!isOwner) return fail('Only the garden owner can do that.', 403);
    if (!isId(body.profileId) || body.profileId === userId) return fail('Pick a player.');
    const key = body.role === 'build' ? 'builders' : 'helpers';
    const problem = await updateGarden((state) => {
      const list = state[key].filter((id) => id !== body.profileId);
      if (body.allow) {
        if (list.length >= MAX_HELPERS) return `You can pick up to ${MAX_HELPERS} players.`;
        list.push(body.profileId);
      }
      state[key] = list;
    });
    if (problem) return fail(problem, 409);
    const what = key === 'builders' ? 'build' : 'plant';
    return respond({ message: body.allow ? `They can ${what} in your garden now.` : `They can no longer ${what} in your garden.` });
  }

  if (body.action === 'buy') {
    const seed = seedNamed(body.seed);
    const amount = Math.floor(Number(body.amount));
    if (!seed) return fail('Pick a seed.');
    if (!Number.isInteger(amount) || amount < 1 || amount > MAX_SEEDS_PER_BUY) return fail(`Buy 1 to ${MAX_SEEDS_PER_BUY} seeds at a time.`);
    const paid = await changeTokens(database, userId, -seed.cost * amount);
    if ('error' in paid) return fail(paid.error!);
    const problem = await updateMine((state) => { state.seeds[seed.name] += amount; });
    if (problem) {
      await changeTokens(database, userId, seed.cost * amount);
      return fail(problem, 409);
    }
    return respond({ tokens: paid.tokens, message: `Bought ${amount} ${seed.name} seed${amount === 1 ? '' : 's'}.` });
  }

  if (body.action === 'plant') {
    const seed = seedNamed(body.seed);
    const x = Math.round(Number(body.x));
    const y = Math.round(Number(body.y));
    if (!isOwner && !garden.helpers.includes(userId)) return fail(`Ask ${owner.username} to let you plant here.`, 403);
    if (!seed) return fail('Pick a seed.');
    if (!Number.isFinite(x) || !Number.isFinite(y) || !inRow(x, y)) return fail('Plant it on one of the dirt rows.');
    if (garden.plants.length >= MAX_PLANTS) return fail('The rows are full. Pick something first.');
    if (garden.plants.some((plant) => Math.hypot(plant.x - x, plant.y - y) < PLANT_GAP)) return fail("That's too close to another plant.");
    if (mine.seeds[seed.name] < 1) return fail(`You have no ${seed.name} seeds. Buy some at Ted's Seed Stand.`);
    const plant: Plant = { id: newId(), seed: seed.name, x, y, plantedAt: Date.now(), plantedBy: userId, plantedByName: current.username, size: rollSize(random()) };
    // Your own garden: one save. A friend's: the seed comes out of your pouch first, and goes back if the plant can't be saved.
    if (isOwner) {
      const problem = await updateMine((state) => {
        if (state.seeds[seed.name] < 1) return `You have no ${seed.name} seeds.`;
        if (state.plants.some((other) => Math.hypot(other.x - x, other.y - y) < PLANT_GAP)) return "That's too close to another plant.";
        state.seeds[seed.name] -= 1;
        state.plants.push(plant);
      });
      if (problem) return fail(problem, 409);
    } else {
      const taken = await updateMine((state) => {
        if (state.seeds[seed.name] < 1) return `You have no ${seed.name} seeds.`;
        state.seeds[seed.name] -= 1;
      });
      if (taken) return fail(taken, 409);
      const problem = await updateGarden((state) => {
        if (state.plants.length >= MAX_PLANTS) return 'The rows are full.';
        if (state.plants.some((other) => Math.hypot(other.x - x, other.y - y) < PLANT_GAP)) return "That's too close to another plant.";
        state.plants.push(plant);
      });
      if (problem) {
        await updateMine((state) => { state.seeds[seed.name] += 1; });
        return fail(problem, 409);
      }
    }
    return respond({ planted: plant.id, message: `Planted a ${seed.name}.` });
  }

  if (body.action === 'harvest') {
    const plant = garden.plants.find((item) => item.id === String(body.plant || ''));
    const seed = plant && seedNamed(plant.seed);
    if (!plant || !seed) return fail('Nothing is growing there.');
    // Whoever planted it picks it (crops from before helpers existed belong to the owner).
    if ((plant.plantedBy || owner.id) !== userId) return fail(`That's ${plant.plantedByName || owner.username}'s ${seed.name}. Only they can pick it.`, 403);
    if (Date.now() < plant.plantedAt + seed.growMs) return fail(`Your ${seed.name} isn't ready yet.`);
    if (mine.crops.length >= MAX_BASKET) return fail(`Your basket is full (${MAX_BASKET} crops). Sell or give some away first.`);
    const crop: Crop = { id: newId(), seed: seed.name, size: plant.size ?? rollSize(random()) };
    if (isOwner) {
      const problem = await updateMine((state) => {
        if (!state.plants.some((item) => item.id === plant.id)) return 'Nothing is growing there.';
        if (state.crops.length >= MAX_BASKET) return 'Your basket is full.';
        state.plants = state.plants.filter((item) => item.id !== plant.id);
        state.crops.push(crop);
      });
      if (problem) return fail(problem, 409);
    } else {
      const problem = await updateGarden((state) => {
        if (!state.plants.some((item) => item.id === plant.id)) return 'Nothing is growing there.';
        state.plants = state.plants.filter((item) => item.id !== plant.id);
      });
      if (problem) return fail(problem, 409);
      const stored = await updateMine((state) => { state.crops.push(crop); });
      if (stored) return fail(stored, 409);
    }
    const lucky = random() < seed.breadletChance && (await giveBreadlet(database, userId, seed.name));
    const what = `${sizeLabel(crop.size)} ${seed.name} (${crop.size}x)`;
    return respond({
      breadlet: lucky ? seed.name : undefined,
      crop,
      message: lucky ? `WOW! You grew a ${seed.name} Breadlet, and a ${what} went in your basket!` : `A ${what} went in your basket. It sells for ${cropValue(seed.name, crop.size)}.`,
    });
  }

  // Sell one crop, or the whole basket. The daily garden limit counts here, not when you pick.
  if (body.action === 'sell') {
    let pay = 0;
    let sold = 0;
    let left = 0;
    const problem = await updateMine((state) => {
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
    const capped = earnedToday(mine) >= DAILY_EARN_LIMIT;
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
    const crop = mine.crops.find((item) => item.id === String(body.crop || ''));
    if (!crop) return fail('That crop is not in your basket.');
    const { data: friend } = await database.from('profiles').select('id, username').eq('id', to).maybeSingle();
    if (!friend) return fail('That player does not exist.');
    if (await isKidAccount(to, database)) return fail("Kid accounts can't get gifts.", 403);
    if (await isBlockedBetween(database, userId, to)) return fail(BLOCKED_MESSAGE, 403);
    // Out of your basket first; if theirs can't be saved, it comes back.
    const taken = await updateMine((state) => {
      if (!state.crops.some((item) => item.id === crop.id)) return 'That crop is not in your basket.';
      state.crops = state.crops.filter((item) => item.id !== crop.id);
    });
    if (taken) return fail(taken, 409);
    const given = await update(database, to, (state) => {
      if (state.crops.length >= MAX_BASKET) return `${friend.username}'s basket is full.`;
      state.crops.push({ ...crop, id: newId(), from: current.username });
    });
    if ('error' in given && given.error) {
      await updateMine((state) => { state.crops.push(crop); });
      return fail(given.error, 409);
    }
    // In their garden, the garden you see is their row, so show the change.
    if (owner.id === to && given.state) garden = given.state;
    return respond({ message: `You gave your ${sizeLabel(crop.size)} ${crop.seed} to ${friend.username}!` });
  }

  // Props: buy one into your bag, place it in a garden you can build in, pick it back up.
  if (body.action === 'buyProp') {
    const def = propNamed(body.kind);
    if (!def) return fail('Pick a prop.');
    const paid = await changeTokens(database, userId, -def.cost);
    if ('error' in paid) return fail(paid.error!);
    const problem = await updateMine((state) => { state.propBag[def.kind] += 1; });
    if (problem) {
      await changeTokens(database, userId, def.cost);
      return fail(problem, 409);
    }
    return respond({ tokens: paid.tokens, message: `Bought a ${def.kind}. Place it in the garden!` });
  }

  if (body.action === 'place') {
    const def = propNamed(body.kind);
    const x = Math.round(Number(body.x));
    const y = Math.round(Number(body.y));
    if (!isOwner && !garden.builders.includes(userId)) return fail(`Ask ${owner.username} to let you build here.`, 403);
    if (!def) return fail('Pick a prop.');
    if (mine.propBag[def.kind] < 1) return fail(`You have no ${def.kind}. Buy one in the Props shop.`);
    if (garden.props.length >= MAX_PROPS) return fail(`A garden can have up to ${MAX_PROPS} props.`);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !canPlaceProp(def.kind, x, y, garden.props)) return fail("It can't go there. Try the grass inside the fence, off the rows.");
    const prop: PlacedProp = { id: newId(), kind: def.kind, x, y, by: userId, byName: current.username };
    const fits = (state: State) => {
      if (state.props.length >= MAX_PROPS) return `A garden can have up to ${MAX_PROPS} props.`;
      if (!canPlaceProp(def.kind, x, y, state.props)) return "Something's already there.";
    };
    if (isOwner) {
      const problem = await updateMine((state) => {
        if (state.propBag[def.kind] < 1) return `You have no ${def.kind}.`;
        const blocked = fits(state);
        if (blocked) return blocked;
        state.propBag[def.kind] -= 1;
        state.props.push(prop);
      });
      if (problem) return fail(problem, 409);
    } else {
      const taken = await updateMine((state) => {
        if (state.propBag[def.kind] < 1) return `You have no ${def.kind}.`;
        state.propBag[def.kind] -= 1;
      });
      if (taken) return fail(taken, 409);
      const problem = await updateGarden((state) => {
        const blocked = fits(state);
        if (blocked) return blocked;
        state.props.push(prop);
      });
      if (problem) {
        await updateMine((state) => { state.propBag[def.kind] += 1; });
        return fail(problem, 409);
      }
    }
    return respond({ message: `Placed a ${def.kind}.` });
  }

  // The owner, or whoever placed it, can pick a prop back up. It goes back to whoever placed it.
  if (body.action === 'pickUp') {
    const prop = garden.props.find((item) => item.id === String(body.prop || ''));
    if (!prop) return fail('That prop is gone.');
    const placer = prop.by || owner.id;
    if (!isOwner && placer !== userId) return fail(`Only ${owner.username} or ${prop.byName || 'whoever placed it'} can pick that up.`, 403);
    const removed = await updateGarden((state) => {
      if (!state.props.some((item) => item.id === prop.id)) return 'That prop is gone.';
      state.props = state.props.filter((item) => item.id !== prop.id);
    });
    if (removed) return fail(removed, 409);
    if (placer === userId) await updateMine((state) => { state.propBag[prop.kind] += 1; });
    else await update(database, placer, (state) => { state.propBag[prop.kind] += 1; });
    return respond({ message: placer === userId ? `Picked up the ${prop.kind}.` : `Picked up the ${prop.kind}. It went back to ${prop.byName || 'whoever placed it'}.` });
  }

  return fail('Unknown action.');
}
