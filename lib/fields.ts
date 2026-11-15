// Breadlet Garden (test): every player has their own garden. Buy seeds at Ted's Seed Stand, plant
// them, come back and harvest. Owners can invite players with a link and let them plant too.
// Shared by the API route (app/api/fields) and the Games tab (app/components/fields-world.tsx).

export type SeedName = "Carrot" | "Potato" | "Pumpkin" | "Avocado" | "Pumpkin Dragon";
export type Seed = { name: SeedName; cost: number; growMs: number; payout: number; breadletChance: number };

// Every seed sells for more than it costs once grown; slower crops pay more per plant.
// Very rarely the harvest is the Breadlet itself (it goes to the inventory, on top of the Bread Bucks).
export const SEEDS: Seed[] = [
  { name: "Carrot", cost: 10, growMs: 2 * 60_000, payout: 22, breadletChance: 1 / 60 },
  { name: "Potato", cost: 40, growMs: 10 * 60_000, payout: 95, breadletChance: 1 / 40 },
  { name: "Pumpkin", cost: 90, growMs: 25 * 60_000, payout: 210, breadletChance: 1 / 35 },
  { name: "Avocado", cost: 150, growMs: 60 * 60_000, payout: 360, breadletChance: 1 / 25 },
  // The rare one: it can hatch the Pumpkin Dragon Breadlet (Unique, normally from the leaf shop).
  { name: "Pumpkin Dragon", cost: 300, growMs: 2 * 60 * 60_000, payout: 720, breadletChance: 1 / 60 },
];
export const seedNamed = (name: unknown) => SEEDS.find((seed) => seed.name === name);

export const PLOT_COUNT = 9;
export const MAX_SEEDS_PER_BUY = 10;
export const MAX_HELPERS = 20;
// The most Bread Bucks one player can earn from gardens each day (UTC). Harvests past it pay nothing
// (a lucky Breadlet still drops).
export const DAILY_EARN_LIMIT = 1000;
export const gardenDay = (time = Date.now()) => new Date(time).toISOString().slice(0, 10);
// plantedBy: who planted it (they're the one who harvests it and gets paid).
export type Plot = { seed: SeedName; plantedAt: number; plantedBy?: string; plantedByName?: string } | null;

export type GardenPerson = { id: string; username: string };
export type FieldsView = {
  owner: GardenPerson;
  isOwner: boolean;
  canPlant: boolean;
  helpers: GardenPerson[];
  plots: Plot[];
  // The viewer's own seed pouch (seeds are yours, whoever's garden you're in).
  seeds: Record<SeedName, number>;
  // Bread Bucks the viewer has earned from gardens today.
  earnedToday: number;
  now: number;
};

export const gardenInviteLink = (origin: string, ownerId: string) => `${origin}/?garden=${encodeURIComponent(ownerId)}`;
