export type MarketPackStock = {
  name: string;
  chance: number;
  soldOutArt?: string;
};

export const marketPackStock: MarketPackStock[] = [
  { name: "Inventions Bag", chance: 1 },
  { name: "Space Bag", chance: 0.61, soldOutArt: "/assets/sold-out-space.svg" },
  { name: "Food Bag", chance: 0.61, soldOutArt: "/assets/sold-out-food.svg" },
  { name: "Lost and Found Bag", chance: 0.25, soldOutArt: "/assets/sold-out-lost-and-found.svg" },
  { name: "Artifact Bag", chance: 0.25, soldOutArt: "/assets/sold-out-artifact.svg" },
  { name: "Combat Bag", chance: 0.2, soldOutArt: "/assets/sold-out-combat.svg" },
  { name: "BlookTuber Bag", chance: 0.05, soldOutArt: "/assets/sold-out-blooktuber.svg" },
  { name: "Human Bag", chance: 0.05 },
  { name: "Pixel Bag", chance: 0.005, soldOutArt: "/assets/sold-out-pixel.svg" },
  { name: "Bread Bag", chance: 0.005, soldOutArt: "/assets/sold-out-bread.svg" },
  { name: "Remix Bag", chance: 0.005, soldOutArt: "/assets/sold-out-remix.svg" },
];

const utcHourKey = (date: Date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}-${String(date.getUTCHours()).padStart(2, "0")}`;

const hourlyRollFor = (hour: string, packName: string) => {
  let hash = 2166136261;
  for (const character of `${hour}:${packName}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x100000000;
};

export const marketStockFor = (date = new Date()) =>
  Object.fromEntries(
    marketPackStock.map(({ name, chance }) => [
      name,
      hourlyRollFor(utcHourKey(date), name) < chance,
    ]),
  ) as Record<string, boolean>;

export const isMarketPackInStock = (name: string, date = new Date()) =>
  marketStockFor(date)[name] === true;

export const nextMarketRefreshAt = (date = new Date()) => {
  const next = new Date(date);
  next.setUTCHours(next.getUTCHours() + 1, 0, 0, 0);
  return next;
};
