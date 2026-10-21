import { chanceFor, craftRecipeFor, dismantleBundleFor, liveCapsules, sellValueFor, wheelRewards } from './gameplay-catalog';
import { isMarketPackInStock } from './market-stock';
import type { Reward } from './gameplay-catalog';

export const MAX_MASS_OPEN_COUNT = 2500;

export type GameplaySnapshot = {
  tokens: number;
  materials: Record<string, number>;
  inventory: Record<string, { quantity: number; rarity: string }>;
  wheelSpun: boolean;
};
export type GameplayPlan = {
  action: string;
  tokenDelta: number;
  materialDelta: Record<string, number>;
  inventoryDelta: Record<string, number>;
  candyDelta: number;
  capsulesOpened: number;
  results: { capsule: string; reward: Reward }[];
  crateReward?: (typeof wheelRewards)[number];
  sold: Record<string, number>;
  tokensEarned: number;
};

const integer = (value: unknown, maximum: number) => {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > maximum) throw new Error('Invalid item quantity.');
  return amount;
};

export function planGameplay(body: Record<string, unknown>, snapshot: GameplaySnapshot, random: () => number, now = new Date()): GameplayPlan {
  const action = String(body.action || '');
  const plan: GameplayPlan = { action, tokenDelta: 0, materialDelta: {}, inventoryDelta: {}, candyDelta: 0, capsulesOpened: 0, results: [], sold: {}, tokensEarned: 0 };
  const addItem = (name: string, quantity: number) => { plan.inventoryDelta[name] = (plan.inventoryDelta[name] || 0) + quantity; };
  if (action === 'open') {
    if (!body.quantities || typeof body.quantities !== 'object' || Array.isArray(body.quantities)) throw new Error('Choose a Goodybag.');
    const quantities = Object.entries(body.quantities as Record<string, unknown>);
    if (!quantities.length || quantities.length > liveCapsules.length) throw new Error('Invalid Goodybag selection.');
    const selected = quantities.map(([name, value]) => {
      const capsule = liveCapsules.find((entry) => entry.name === name);
      if (!capsule) throw new Error('Unknown Goodybag.');
      if (!isMarketPackInStock(name, now)) throw new Error(`${name} is out of stock. Check back after the next hourly refresh.`);
      return { capsule, quantity: integer(value, MAX_MASS_OPEN_COUNT) };
    });
    const count = selected.reduce((total, entry) => total + entry.quantity, 0);
    if (count > MAX_MASS_OPEN_COUNT) throw new Error(`Open at most ${MAX_MASS_OPEN_COUNT} Goodybags at a time.`);
    const cost = selected.reduce((total, entry) => total + entry.capsule.price * entry.quantity, 0);
    if (snapshot.tokens < cost) throw new Error('You need more tokens for those Goodybags.');
    plan.tokenDelta = -cost;
    plan.capsulesOpened = count;
    for (const { capsule, quantity } of selected) {
      const total = capsule.pool.reduce((sum, reward) => sum + chanceFor(capsule, reward), 0);
      for (let opened = 0; opened < quantity; opened += 1) {
        let roll = random() * total;
        const reward = capsule.pool.find((entry) => { roll -= chanceFor(capsule, entry); return roll < 0; }) || capsule.pool[capsule.pool.length - 1];
        addItem(reward.name, 1);
        plan.results.push({ capsule: capsule.name, reward });
      }
    }
  } else if (action === 'crate') {
    if (snapshot.wheelSpun) throw new Error('You can claim tokens again once an hour has passed.');
    let roll = random() * wheelRewards.reduce((total, reward) => total + reward.chance, 0);
    const reward = wheelRewards.find((entry) => { roll -= entry.chance; return roll < 0; }) || wheelRewards[wheelRewards.length - 1];
    plan.crateReward = reward;
    if (reward.type === 'tokens') plan.tokenDelta = reward.amount;
    else plan.materialDelta[reward.material] = reward.amount;
  } else if (action === 'craft') {
    const recipe = craftRecipeFor(String(body.name || ''));
    if (!recipe) throw new Error('Unknown crafting recipe.');
    for (const [material, amount] of Object.entries(recipe.ingredients)) {
      if ((snapshot.materials[material] || 0) < amount) throw new Error(`You need more ${material}.`);
      plan.materialDelta[material] = -amount;
    }
    addItem(recipe.name, 1);
  } else if (action === 'dismantle' && body.quantities && typeof body.quantities === 'object' && !Array.isArray(body.quantities)) {
    const quantities = Object.entries(body.quantities as Record<string, unknown>);
    if (!quantities.length || quantities.length > 200) throw new Error('Invalid recycle selection.');
    for (const [name, value] of quantities) {
      const quantity = integer(value, 100000);
      const owned = snapshot.inventory[name];
      if (!owned || quantity >= owned.quantity) throw new Error(`Keep one copy of ${name}.`);
      addItem(name, -quantity);
      for (const [material, amount] of Object.entries(dismantleBundleFor(name, owned.rarity))) {
        plan.materialDelta[material] = (plan.materialDelta[material] || 0) + amount * quantity;
      }
    }
  } else if (action === 'dismantle') {
    const name = String(body.name || '');
    const owned = snapshot.inventory[name];
    if (!owned?.quantity) throw new Error('You do not own that Breadlet.');
    if (Object.values(snapshot.inventory).reduce((total, entry) => total + entry.quantity, 0) <= 1) throw new Error('Keep at least one Breadlet in your collection.');
    plan.materialDelta = dismantleBundleFor(name, owned.rarity);
    addItem(name, -1);
  } else if (action === 'sell') {
    if (!body.quantities || typeof body.quantities !== 'object' || Array.isArray(body.quantities)) throw new Error('Choose extra Breadlets to sell.');
    const quantities = Object.entries(body.quantities as Record<string, unknown>);
    if (!quantities.length || quantities.length > 200) throw new Error('Invalid sale selection.');
    for (const [name, value] of quantities) {
      const quantity = integer(value, 100000);
      const owned = snapshot.inventory[name];
      if (!owned || quantity >= owned.quantity) throw new Error(`Keep one copy of ${name}.`);
      addItem(name, -quantity);
      plan.sold[name] = quantity;
      plan.tokensEarned += quantity * sellValueFor(owned.rarity);
    }
    plan.tokenDelta = plan.tokensEarned;
  } else throw new Error('Unknown gameplay action.');
  return plan;
}