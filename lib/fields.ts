// Breadlet Garden (test, admin only): buy seeds at Ted's Seed Stand, plant them, come back and harvest.
// Shared by the API route (app/api/fields) and the Games tab (app/components/fields-world.tsx).

export type SeedName = "Carrot" | "Potato" | "Pumpkin" | "Avocado";
export type Seed = { name: SeedName; cost: number; growMs: number; payout: number; breadletChance: number };

// Every seed sells for more than it costs once grown; slower crops pay more per plant.
// Very rarely the harvest is the Breadlet itself (it goes to the inventory, on top of the Bread Bucks).
export const SEEDS: Seed[] = [
  { name: "Carrot", cost: 10, growMs: 2 * 60_000, payout: 22, breadletChance: 1 / 60 },
  { name: "Potato", cost: 40, growMs: 10 * 60_000, payout: 95, breadletChance: 1 / 40 },
  { name: "Pumpkin", cost: 90, growMs: 25 * 60_000, payout: 210, breadletChance: 1 / 35 },
  { name: "Avocado", cost: 150, growMs: 60 * 60_000, payout: 360, breadletChance: 1 / 25 },
];
export const seedNamed = (name: unknown) => SEEDS.find((seed) => seed.name === name);

export const PLOT_COUNT = 9;
export const MAX_SEEDS_PER_BUY = 10;
export type Plot = { seed: SeedName; plantedAt: number } | null;

export type FieldsView = {
  plots: Plot[];
  seeds: Record<SeedName, number>;
  now: number;
};
