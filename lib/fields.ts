// Breadlet Fields (test, admin only): a garden and a dig site you walk around as your Breadlet.
// Shared by the API route (app/api/fields) and the Games tab (app/components/fields-world.tsx).

export type SeedName = "Carrot" | "Potato" | "Avocado";
export type Seed = { name: SeedName; cost: number; growMs: number; payout: number; breadletChance: number };

// Each seed pays back more than it costs once it's grown; longer crops pay more per plant.
// Very rarely the harvest is the Breadlet itself (it goes to the inventory, on top of the Bread Bucks).
export const SEEDS: Seed[] = [
  { name: "Carrot", cost: 10, growMs: 2 * 60_000, payout: 22, breadletChance: 1 / 60 },
  { name: "Potato", cost: 40, growMs: 10 * 60_000, payout: 95, breadletChance: 1 / 40 },
  { name: "Avocado", cost: 150, growMs: 60 * 60_000, payout: 360, breadletChance: 1 / 25 },
];
export const seedNamed = (name: unknown) => SEEDS.find((seed) => seed.name === name);

export const PLOT_COUNT = 6;
export type Plot = { seed: SeedName; plantedAt: number } | null;

// Dig site: a fresh board of buried prizes every UTC hour, and a few shovels to dig it with.
export const DIG_COLUMNS = 5;
export const DIG_ROWS = 4;
export const DIG_TILES = DIG_COLUMNS * DIG_ROWS;
export const SHOVELS_PER_HOUR = 5;
export type DigPrize = { kind: "nothing" } | { kind: "tokens"; amount: number } | { kind: "breadlet"; name: string };
// Rolled once per tile when a new board is made. Average is about 26 Bread Bucks a dig.
export const ARTIFACT_FINDS = ["Aztec Coin", "Clay Vase", "Map"];
export const rollDigPrize = (random: () => number): DigPrize => {
  const roll = random();
  if (roll < 0.01) return { kind: "breadlet", name: ARTIFACT_FINDS[Math.floor(random() * ARTIFACT_FINDS.length)] };
  if (roll < 0.05) return { kind: "tokens", amount: 250 };
  if (roll < 0.15) return { kind: "tokens", amount: 75 };
  if (roll < 0.6) return { kind: "tokens", amount: 10 + Math.floor(random() * 21) };
  return { kind: "nothing" };
};

export const hourKey = (date = new Date()) => date.toISOString().slice(0, 13);
export const nextHourAt = (date = new Date()) => {
  const next = new Date(date);
  next.setUTCMinutes(60, 0, 0);
  return next.getTime();
};

// What the browser sees: dug tiles only, never the prizes still buried.
export type FieldsView = {
  plots: Plot[];
  dig: { hour: string; dug: Record<number, DigPrize>; shovels: number; refillsAt: number };
  now: number;
};
