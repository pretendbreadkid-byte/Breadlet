// Breadlet Garden (test): every player has their own garden. Buy seeds at Ted's Seed Stand, plant
// them anywhere in the two dirt rows, come back and pick them. Owners invite players with a link and
// choose who may plant and who may build (place props).
// Shared by the API route (app/api/fields) and the Games tab (app/components/fields-world.tsx).

export type SeedName = "Carrot" | "Potato" | "Pumpkin" | "Avocado" | "Pumpkin Dragon";
export type Seed = { name: SeedName; cost: number; growMs: number; payout: number; breadletChance: number };

// Every seed sells for more than it costs once grown; slower crops pay more per plant.
// Very rarely the harvest is the Breadlet itself (it goes to the inventory).
export const SEEDS: Seed[] = [
  { name: "Carrot", cost: 10, growMs: 2 * 60_000, payout: 22, breadletChance: 1 / 60 },
  { name: "Potato", cost: 40, growMs: 10 * 60_000, payout: 95, breadletChance: 1 / 40 },
  { name: "Pumpkin", cost: 90, growMs: 25 * 60_000, payout: 210, breadletChance: 1 / 35 },
  { name: "Avocado", cost: 150, growMs: 60 * 60_000, payout: 360, breadletChance: 1 / 25 },
  // The rare one: it can hatch the Pumpkin Dragon Breadlet (Unique, normally from the leaf shop).
  { name: "Pumpkin Dragon", cost: 300, growMs: 2 * 60 * 60_000, payout: 720, breadletChance: 1 / 60 },
];
export const seedNamed = (name: unknown) => SEEDS.find((seed) => seed.name === name);

// The garden's place in the world (world pixels). The gate is in the middle of the front fence.
export const GARDEN = { x: 940, y: 480, width: 980, height: 800 };
export const GATE = { x: 1430, width: 130 };
// The two long dirt rows. Plant anywhere on them, as long as it isn't right on top of another plant.
export const ROWS = [
  { x: 1060, y: 560, width: 740, height: 180 },
  { x: 1060, y: 830, width: 740, height: 180 },
];
export const PLANT_GAP = 58;
export const MAX_PLANTS = 48;
export const inRow = (x: number, y: number) => ROWS.some((row) => x >= row.x + 26 && x <= row.x + row.width - 26 && y >= row.y + 36 && y <= row.y + row.height - 10);

export const MAX_SEEDS_PER_BUY = 10;
export const MAX_HELPERS = 20;
// The most Bread Bucks one player can earn from gardens each day (UTC). Selling past it is blocked
// (your crops wait in the basket).
export const DAILY_EARN_LIMIT = 1000;
export const gardenDay = (time = Date.now()) => new Date(time).toISOString().slice(0, 10);

// plantedBy: who planted it (they're the one who harvests it). size: how big it grows (rolled when
// planted, shown once it's grown); bigger crops sell for more.
export type Plant = { id: string; seed: SeedName; x: number; y: number; plantedAt: number; plantedBy?: string; plantedByName?: string; size?: number };

// Harvests go into your basket instead of selling straight away. Sell them one by one or all at once,
// hold one in your hand, or give it to another player. from: who gave it to you.
export type Crop = { id: string; seed: SeedName; size: number; from?: string };
export const MAX_BASKET = 60;

// Sizes run 0.6x to 2x, mostly near the small end, so a giant one is a nice surprise.
export const MIN_SIZE = 0.6;
export const MAX_SIZE = 2;
export const rollSize = (random: number) => Math.round((MIN_SIZE + (MAX_SIZE - MIN_SIZE) * random ** 2) * 100) / 100;
export const cropValue = (seed: SeedName, size: number) => Math.max(1, Math.round((seedNamed(seed)?.payout || 0) * size));
export const sizeLabel = (size: number) => size >= 1.8 ? "Giant" : size >= 1.45 ? "Huge" : size >= 1.15 ? "Big" : size >= 0.85 ? "Normal" : size >= 0.7 ? "Small" : "Tiny";

// Props: bought at the Props shop, then placed anywhere in the garden off the dirt rows by the owner
// or players they let build. width: how wide it's drawn. solid: circles (offset from its feet) you
// can't walk through.
export type PropKind = "Rock" | "Chest" | "Green Screen" | "Tree" | "Berry Bush";
export type PropDef = { kind: PropKind; cost: number; art: string; width: number; solid: { dx: number; r: number }[] };
export const PROPS: PropDef[] = [
  { kind: "Rock", cost: 100, art: "/assets/rock-3.svg", width: 130, solid: [{ dx: -28, r: 26 }, { dx: 28, r: 26 }] },
  { kind: "Chest", cost: 400, art: "/assets/treasure-chest.svg", width: 110, solid: [{ dx: 0, r: 40 }] },
  { kind: "Berry Bush", cost: 150, art: "/assets/garden/berry-bush.svg", width: 130, solid: [{ dx: -30, r: 26 }, { dx: 30, r: 26 }] },
  { kind: "Tree", cost: 300, art: "/assets/garden/tree-prop.svg", width: 150, solid: [{ dx: -5, r: 22 }] },
  { kind: "Green Screen", cost: 750, art: "/assets/garden/green-screen.svg", width: 230, solid: [{ dx: -80, r: 22 }, { dx: -27, r: 22 }, { dx: 27, r: 22 }, { dx: 80, r: 22 }] },
];
export const propNamed = (kind: unknown) => PROPS.find((prop) => prop.kind === kind);
export const MAX_PROPS = 30;
export type PlacedProp = { id: string; kind: PropKind; x: number; y: number; by?: string; byName?: string };
// Props go on the grass inside the fence: not on the rows, not in the gateway, not on another prop.
export const canPlaceProp = (kind: PropKind, x: number, y: number, props: PlacedProp[], ignoreId?: string) => {
  const def = propNamed(kind);
  if (!def) return false;
  const half = def.width / 2;
  const front = GARDEN.y + GARDEN.height;
  if (x - half < GARDEN.x + 30 || x + half > GARDEN.x + GARDEN.width - 30 || y < GARDEN.y + 90 || y > front - 30) return false;
  if (ROWS.some((row) => x + half > row.x && x - half < row.x + row.width && y > row.y - 10 && y < row.y + row.height + 40)) return false;
  if (Math.abs(x - GATE.x) < half + 70 && y > front - 130) return false;
  return !props.some((prop) => prop.id !== ignoreId && Math.abs(prop.x - x) < (half + (propNamed(prop.kind)?.width || 100) / 2) * 0.8 && Math.abs(prop.y - y) < 60);
};

export type GardenPerson = { id: string; username: string };
export type FieldsView = {
  owner: GardenPerson;
  isOwner: boolean;
  canPlant: boolean;
  canBuild: boolean;
  // Who the owner lets plant, and who they let build (only sent to the owner).
  helpers: GardenPerson[];
  builders: GardenPerson[];
  plants: Plant[];
  props: PlacedProp[];
  // The viewer's own seed pouch, basket and props (yours, whoever's garden you're in).
  seeds: Record<SeedName, number>;
  crops: Crop[];
  propBag: Record<PropKind, number>;
  // Bread Bucks the viewer has earned from gardens today.
  earnedToday: number;
  now: number;
};

export const gardenInviteLink = (origin: string, ownerId: string) => `${origin}/?garden=${encodeURIComponent(ownerId)}`;
