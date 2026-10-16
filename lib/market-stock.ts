export type MarketPackStock = {
  name: string;
  chance: number;
};

export const marketPackStock: MarketPackStock[] = [
  { name: "Inventions Bag", chance: 0.45 },
  { name: "Space Bag", chance: 1 },
  { name: "Food Bag", chance: 0.8 },
  { name: "Lost and Found Bag", chance: 0.5 },
  { name: "Artifact Bag", chance: 0.25 },
  { name: "Combat Bag", chance: 0.2 },
  { name: "BlookTuber Bag", chance: 0.05 },
  { name: "Human Bag", chance: 0.05 },
  { name: "Pixel Bag", chance: 0.005 },
  { name: "Bread Bag", chance: 0.005 },
  { name: "Remix Bag", chance: 0.005 },
];

const hourlyRollFor = (hour: string, packName: string) => {
  let hash = 2166136261;
  for (const character of `${hour}:${packName}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x100000000;
};

const utcHourKey = (date: Date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}-${String(date.getUTCHours()).padStart(2, "0")}`;

export const marketStockFor = (date = new Date()) => {
  const hour = utcHourKey(date);
  const stock = Object.fromEntries(
    marketPackStock.map(({ name, chance }) => [
      name,
      hourlyRollFor(hour, name) < chance,
    ]),
  ) as Record<string, boolean>;
  const availableCount = Object.values(stock).filter(Boolean).length;

  if (availableCount < 4) {
    const fallbackPacks = [...marketPackStock]
      .sort((left, right) => right.chance - left.chance)
      .filter(({ name }) => !stock[name]);
    for (const { name } of fallbackPacks.slice(0, 4 - availableCount)) {
      stock[name] = true;
    }
  }

  return stock;
};

export const isMarketPackInStock = (name: string, date = new Date()) =>
  marketStockFor(date)[name] === true;

export const nextMarketRefreshAt = (date = new Date()) => {
  const next = new Date(date);
  next.setUTCHours(next.getUTCHours() + 1, 0, 0, 0);
  return next;
};
