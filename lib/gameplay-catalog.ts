// rotation: one of a group that takes turns in the pool, one per UTC day (see isRewardActive).
export type Reward = { name: string; rarity: string; weight: number; chance?: number; art?: string; rotation?: { slot: number; size: number } };

export type Capsule = {
  name: string;
  price: number;
  art: string;
  pool: Reward[];
  retired?: boolean;
  // Seasonal packs (see seasonalPackOpensAt in market-stock.ts) don't count toward the pool
  // sizes that set other packs' Mythic odds.
  seasonal?: boolean;
  note?: string;
  // Total % chance for a whole rarity tier, split evenly among its items. Other tiers
  // keep their usual proportions and share whatever is left.
  rarityChances?: Record<string, number>;
};

export const rarityBudget: Record<string, number> = {
  Common: 30,
  Uncommon: 30,
  Rare: 20,
  Epic: 12,
  Legendary: 5,
  Mythic: 0.5,
  Secret: 0.1,
  Unique: 0.975,
  Breadled: 0.025,
};

export const rarityOrder = ["Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythic", "Secret", "Unique", "Breadled", "Chroma"];
export const sortByRarity = <T extends { rarity: string }>(items: T[]) =>
  [...items].sort((left, right) => rarityOrder.indexOf(left.rarity) - rarityOrder.indexOf(right.rarity));

export const rewards = (
  items: [string, string][],
  artNames: Record<string, string> = {},
  chances: Record<string, number> = {},
) =>
  items.map(([name, rarity]) => {
    const sameRarityCount = items.filter(([, itemRarity]) => itemRarity === rarity).length;
    return {
      name,
      rarity,
      weight: (rarityBudget[rarity] || 0.1) / sameRarityCount,
      chance: chances[name],
      art: artNames[name],
    };
  });

// Rotations take turns one per UTC day, starting with slot 0 on December 1, 2026.
const ROTATION_START = Date.UTC(2026, 11, 1);
export const rotationSlotFor = (size: number, date = new Date()) => {
  const day = Math.floor((date.getTime() - ROTATION_START) / 86400000);
  return ((day % size) + size) % size;
};
export const isRewardActive = (reward: Reward, date = new Date()) =>
  !reward.rotation || rotationSlotFor(reward.rotation.size, date) === reward.rotation.slot;

// Turns a group of same-rarity rewards into a daily rotation. Weights are set as if the group
// were a single item, so the rest of the pack keeps its normal odds whichever one is up.
const dailyRotation = (pool: Reward[], names: string[]) => {
  const rarity = pool.find((reward) => reward.name === names[0])!.rarity;
  const activeInTier = pool.filter((reward) => reward.rarity === rarity && !names.includes(reward.name)).length + 1;
  return pool.map((reward) => reward.rarity !== rarity ? reward : {
    ...reward,
    weight: (rarityBudget[rarity] || 0.1) / activeInTier,
    rotation: names.includes(reward.name) ? { slot: names.indexOf(reward.name), size: names.length } : undefined,
  });
};

// A reward's % chance in a pack on the given day (0 for rotation items that aren't up today).
export const chanceFor = (capsule: Capsule, reward: Reward, date = new Date()) => {
  if (!isRewardActive(reward, date)) return 0;
  if (reward.chance !== undefined) return reward.chance;
  const pool = capsule.pool.filter((item) => isRewardActive(item, date));
  const rarityChances = capsule.rarityChances || {};
  const tierSize = (rarity: string) => pool.filter((item) => item.rarity === rarity && item.chance === undefined).length;
  if (rarityChances[reward.rarity] !== undefined) return rarityChances[reward.rarity] / tierSize(reward.rarity);
  const mythicFixed = rarityChances.Mythic !== undefined;
  const mythicRewards = pool.filter((item) => item.rarity === "Mythic" && item.chance === undefined);
  const poolSizes = [...liveCapsules, ...legacyCapsules].filter((item) => !item.seasonal).map((item) => item.pool.length);
  const smallestPool = Math.min(...poolSizes);
  const largestPool = Math.max(...poolSizes);
  const mythicPoolChance =
    0.2 + ((capsule.pool.length - smallestPool) / (largestPool - smallestPool)) * 0.3;
  if (reward.rarity === "Mythic" && !mythicFixed) {
    return mythicPoolChance / mythicRewards.length;
  }
  const fixedChance =
    pool.reduce((sum, item) => sum + (item.chance || 0), 0) +
    (mythicFixed || !mythicRewards.length ? 0 : mythicPoolChance) +
    Object.entries(rarityChances).reduce((sum, [rarity, chance]) => sum + (tierSize(rarity) ? chance : 0), 0);
  const weightedRewards = pool.filter(
    (item) => item.chance === undefined && item.rarity !== "Mythic" && rarityChances[item.rarity] === undefined,
  );
  const remainingWeight = weightedRewards.reduce((sum, item) => sum + item.weight, 0);
  return ((100 - fixedChance) * reward.weight) / remainingWeight;
};

// Ted and Walter White can't be sold, listed on the Bazaar or traded. Other Unique Breadlets
// (the leaf shop prizes, the Skeleton Pirates) can.
export const isUniqueBreadlet = (name: string) => {
  const baseName = name.replace(/^Shiny /, "");
  return baseName === "Ted" || baseName === "Walter White";
};

// Breadlets taken out of the game that players still own (Worker, Red Rex, the old Pixel Bag...).
// For now they can't be sold, listed on the Bazaar or traded. Putting one back in a pack or on the
// crafting table makes it tradable again.
const removedBreadletNames = new Set([
  "Actor", "Albino Crow", "Autumn Cat", "Bomb", "Brioche", "Burnt Toast", "Carmel", "Caveman", "Chef", "Chipmunk",
  "Crimson Octopus", "Crow", "Doctor", "Donut", "Gnome", "Golden UFO", "Lava Slime", "Mr. Frog", "Mr. Receipt", "Ninja",
  "Pixel Apple", "Pixel Aztec Coin", "Pixel Bomb", "Pixel Caramel", "Pixel Chick", "Pixel Constellation", "Pixel Crystal Ball",
  "Pixel Ember", "Pixel Fuego", "Pixel Glacier", "Pixel Ice Slime", "Pixel Lagoon", "Pixel Relic", "Pixel Sprinkle Bread",
  "Pixel Toast", "Pixel UFO", "Pixel Wizard", "Red Rex", "Shield", "Space Trooper", "Surgeon", "Worker",
]);
export const isRemovedBreadlet = (name: string) => {
  const baseName = name.replace(/^Shiny /, "");
  return removedBreadletNames.has(baseName)
    && !liveCapsules.some((capsule) => capsule.pool.some((reward) => reward.name === baseName))
    && !craftRecipeFor(baseName);
};

// Can't be sold, listed or traded: Ted, Walter White and removed Breadlets.
export const isUntradableBreadlet = (name: string) => isUniqueBreadlet(name) || isRemovedBreadlet(name);
export const untradableReason = (name: string) =>
  isUniqueBreadlet(name) ? `${name} is Unique` : `${name} was removed from the game`;

export const sellValueFor = (rarity: string) =>
  ({
    Common: 5,
    Uncommon: 12,
    Rare: 15,
    Epic: 75,
    Legendary: 150,
    Mythic: 300,
    Secret: 400,
    Unique: 500,
    Breadled: 1000,
  })[rarity] || 5;

export const materialNames = [
  "Gold",
  "Cloth",
  "Gem",
  "Sugar",
  "Flower",
  "Metal",
];

export const dismantleMaterialNames = materialNames.filter((material) => material !== "Gold" && material !== "Gem");

// Halved to slow inflation: the hourly claim was the biggest source of new Bread Bucks.
export const wheelRewards = [
  { label: "50 Bread Bucks", type: "tokens", amount: 50, chance: 8 },
  { label: "100 Bread Bucks", type: "tokens", amount: 100, chance: 14 },
  { label: "150 Bread Bucks", type: "tokens", amount: 150, chance: 19 },
  { label: "200 Bread Bucks", type: "tokens", amount: 200, chance: 21 },
  { label: "250 Bread Bucks", type: "tokens", amount: 250, chance: 17 },
  { label: "300 Bread Bucks", type: "tokens", amount: 300, chance: 11 },
  { label: "400 Bread Bucks", type: "tokens", amount: 400, chance: 4 },
  { label: "500 Bread Bucks", type: "tokens", amount: 500, chance: 2.5 },
  { label: "750 Bread Bucks", type: "tokens", amount: 750, chance: 1 },
  { label: "5 Gold", type: "material", material: "Gold", amount: 5, chance: 1.25 },
  { label: "5 Gem", type: "material", material: "Gem", amount: 5, chance: 1.25 },
] as const;

export const materialFor = (name: string, rarity: string) =>
  rarity === "Mythic" || rarity === "Secret" || rarity === "Breadled"
    ? "Metal"
    : rarity === "Legendary"
      ? "Metal"
      : name.toLowerCase().includes("bread") ||
          name.toLowerCase().includes("toast") ||
          name.toLowerCase().includes("dough")
        ? "Sugar"
        : name.toLowerCase().includes("grenade") ||
            name.toLowerCase().includes("shuriken") ||
            name.toLowerCase().includes("blaster")
          ? "Metal"
          : name.toLowerCase().includes("crystal") ||
              name.toLowerCase().includes("glass")
            ? "Metal"
            : dismantleMaterialNames[name.length % dismantleMaterialNames.length];

export type MaterialBundle = Record<string, number>;

export const dismantleBundleFor = (name: string, rarity: string): MaterialBundle => {
  const primary = materialFor(name, rarity);
  const primaryIndex = dismantleMaterialNames.indexOf(primary);
  const secondary = dismantleMaterialNames[(primaryIndex + name.length + rarity.length) % dismantleMaterialNames.length];
  return {
    [primary]: 3,
    [secondary === primary ? dismantleMaterialNames[(primaryIndex + 1) % dismantleMaterialNames.length] : secondary]: 2,
  };
};

export const craftRecipes: { name: string; ingredients: MaterialBundle }[] = [
  { name: "Lion", ingredients: { Flower: 12, Sugar: 8 } },
  { name: "Yeti", ingredients: { Metal: 12, Cloth: 8 } },
  { name: "Sandwich", ingredients: { Cloth: 12, Flower: 8 } },
  { name: "Butterfly", ingredients: { Sugar: 12, Flower: 8 } },
  { name: "Blackbeard", ingredients: { Metal: 12, Cloth: 8 } },
  { name: "Sugar Glider", ingredients: { Sugar: 12, Cloth: 8 } },
  { name: "Tyrannosaurus Rex", ingredients: { Metal: 12, Flower: 8 } },
  { name: "Megalodon", ingredients: { Sugar: 12, Metal: 8 } },
  { name: "Megabot", ingredients: { Metal: 12, Flower: 8 } },
  { name: "King", ingredients: { Flower: 12, Cloth: 8 } },
  { name: "Phantom King", ingredients: { Gold: 10, Gem: 10 } },
  { name: "Rainbow Astro", ingredients: { Gold: 10, Gem: 10 } },
];

export const craftRecipeFor = (name: string) =>
  craftRecipes.find((recipe) => recipe.name === name);

export const craftedRarityFor = (name: string) =>
  name === "Rainbow Astro" || name === "Phantom King" ? "Mythic" : "Legendary";

// Crafted Breadlets only cost materials, so selling them at full rarity value printed Bread Bucks.
// They sell for a tenth of normal (Legendary 15, Mythic 30).
export const CRAFTED_SELL_RATE = 0.1;
export const sellValueForBlook = (name: string, rarity: string) =>
  craftRecipeFor(name.replace(/^Shiny /, ""))
    ? Math.max(1, Math.floor(sellValueFor(rarity) * CRAFTED_SELL_RATE))
    : sellValueFor(rarity);

export const liveCapsules: Capsule[] = [
  {
    name: "Inventions Bag",
    price: 25,
    // Average resale was above the price (open-and-sell printed tokens); now ~17.
    rarityChances: { Epic: 6, Legendary: 1.5, Mythic: 0.21 },
    art: "/assets/inventions-bag-3.svg",
    pool: rewards([
      ["Wheel", "Common"],
      ["Magnifying Glass", "Common"],
      ["Letter", "Uncommon"],
      ["Gears", "Rare"],
      ["Antibiotics", "Epic"],
      ["Light Bulb", "Epic"],
      ["Leonardo da Vinci", "Legendary"],
      ["Bitcoin", "Mythic"],
    ], {
      "Magnifying Glass": "/assets/magnifying-glass-2.svg",
    }),
  },
  {
    name: "Space Bag",
    price: 25,
    // Secret odds run 0.01% (smallest pack) to 0.09% (biggest pack) by pool size.
    rarityChances: { Mythic: 0.3, Secret: 0.04 },
    art: "/assets/space-bag-4.svg",
    pool: rewards([
      ["Mars", "Common"],
      ["Earth", "Uncommon"],
      ["Globe", "Uncommon"],
      ["Star", "Rare"],
      ["Space Goo", "Uncommon"],
      ["Consolation", "Uncommon"],
      ["Sun", "Rare"],
      ["Eclipse", "Epic"],
      ["Astronaut", "Mythic"],
      ["Alien", "Secret"],
      ["Star Ship", "Breadled"],
    ], {
      Earth: "/assets/earth-3.svg",
      Globe: "/assets/earth-globe.svg",
      Sun: "/assets/sun.svg",
      Eclipse: "/assets/solar%20ecplise%20but%20good.svg",
      Alien: "/assets/alien.webp?v=2",
      Astronaut: "/assets/astronaut.webp",
    }, { "Star Ship": 0.005 }),
  },
  {
    name: "Lost and Found Bag",
    price: 25,
    art: "/assets/lost-and-found-2.svg",
    pool: rewards([
      ["Car Keys", "Common"],
      ["Hand Mirror", "Common"],
      ["Coffee Mug", "Common"],
      ["Wallet", "Uncommon"],
      ["Hat", "Uncommon"],
      ["Book", "Rare"],
      ["Tablet", "Legendary"],
      ["Button", "Mythic"],
      ["Lost and Found Box", "Breadled"],
    ], { "Coffee Mug": "/assets/coffee-mug.svg" }, { "Lost and Found Box": 0.003 }),
  },
  {
    name: "Food Bag",
    price: 25,
    // Average resale was above the price (open-and-sell printed tokens); now ~17.
    rarityChances: { Epic: 6, Legendary: 1.5, Secret: 0.06 },
    art: "/assets/food-bag-2.svg",
    pool: rewards([
      ["Rock", "Common"],
      ["Apple", "Common"],
      ["Potato", "Common"],
      ["Fries", "Uncommon"],
      ["Egg", "Uncommon"],
      ["Carrot", "Uncommon"],
      ["Candy Corn", "Rare"],
      ["Avocado", "Common"],
      ["Caramel", "Epic"],
      ["Sprinkle Bread", "Epic"],
      ["Pepper", "Rare"],
      ["Ice Cream", "Legendary"],
      ["Ghost Pepper", "Mythic"],
      ["Pickle", "Secret"],
    ], {
      Pepper: "/assets/pepper.webp",
      "Ghost Pepper": "/assets/ghost-pepper.webp",
    }),
  },
  {
    name: "Artifact Bag",
    price: 25,
    // Average resale was above the price (open-and-sell printed tokens); now ~17.
    rarityChances: { Epic: 6, Legendary: 1.5, Secret: 0.01 },
    art: "/assets/artifact-bag-3.svg",
    pool: rewards([
      ["Aztec Coin", "Common"],
      ["Clay Vase", "Common"],
      ["Map", "Uncommon"],
      ["Crystal Ball", "Rare"],
      ["Necklace", "Epic"],
      ["Stone Tablet", "Legendary"],
      ["Timeglass", "Secret"],
    ], {
      "Clay Vase": "/assets/clay-vase.svg",
    }),
  },
  {
    name: "Combat Bag",
    price: 25,
    // Average resale was above the price (open-and-sell printed tokens); now ~17.
    rarityChances: { Epic: 6, Legendary: 1.5, Mythic: 0.25 },
    art: "/assets/combat-bag-2.svg",
    pool: rewards([
      ["Olive Grenade", "Common"],
      ["The Bomb", "Uncommon"],
      ["Golden Grenade", "Rare"],
      ["Sword", "Rare"],
      ["Shuriken", "Uncommon"],
      ["Nunchucks", "Epic"],
      ["Spartan", "Legendary"],
      ["Golden Shuriken", "Mythic"],
      ["Diamond Sword", "Breadled"],
    ]),
  },
  {
    // Was the BlookTuber Bag. Blook Master, Waymore, Turtwix, Blooket Life and Lagoon became Silver
    // Play Button, Green Screen, YouTube Logo, Camera and Microphone (migration 0079).
    name: "YouTube Bag",
    price: 25,
    // Average resale was above the price (open-and-sell printed tokens); now ~17.
    rarityChances: { Epic: 6, Legendary: 1.5, Mythic: 0.32, Secret: 0.05 },
    art: "/assets/youtube-bag.svg",
    pool: rewards([
      ["Bread Blook", "Mythic"],
      ["Camera", "Uncommon"],
      ["Blooket Gods", "Common"],
      ["Fasty Jay", "Epic"],
      ["Microphone", "Rare"],
      ["Green Screen", "Epic"],
      ["Twisted Bread", "Uncommon"],
      ["SRN", "Uncommon"],
      ["Silver Play Button", "Legendary"],
      ["YouTube Logo", "Rare"],
      ["Green Astronaut", "Uncommon"],
      ["Gold Play Button", "Secret"],
    ], {
      "Twisted Bread": "/assets/twisted-bread-blooktuber.png",
      SRN: "/assets/srn-blooktuber.png",
      "Silver Play Button": "/assets/silver-play-button.svg",
      "YouTube Logo": "/assets/youtube-logo.svg",
      "Green Astronaut": "/assets/green-astronaut-blooktuber.png",
      Camera: "/assets/camera.svg",
      Microphone: "/assets/microphone.svg",
      "Green Screen": "/assets/green-screen.svg",
      "Gold Play Button": "/assets/gold-play-button.svg",
    }),
  },
  {
    name: "Bread Bag",
    price: 30,
    art: "/assets/bread-bag-4.svg",
    pool: rewards([
      ["Sour Dough", "Common"],
      ["Toaster", "Rare"],
      ["Golden Toaster", "Breadled"],
      ["Croissant", "Common"],
      ["Cinnamon Roll", "Uncommon"],
      ["Robo Bread", "Epic"],
      ["Slime Bread", "Rare"],
      ["Gold Bread", "Legendary"],
      ["Holy Bread", "Mythic"],
    ], {
      "Sour Dough": "/assets/sour-dough-refreshed.svg",
      Toaster: "/assets/toaster-bread.svg",
      Croissant: "/assets/croissant.svg",
      "Cinnamon Roll": "/assets/cinnamon-roll-refreshed.svg",
      "Robo Bread": "/assets/robo-bread-2.svg",
      "Slime Bread": "/assets/slime-bread.svg",
      "Gold Bread": "/assets/gold-bread-3.svg",
      "Holy Bread": "/assets/holy-bread-refreshed.svg",
      "Golden Toaster": "/assets/golden-toaster-animated.svg",
    },
    // Fixed odds keep the average resale value (~16) well under the price, so opening
    // and reselling Bread Bags can't print tokens.
    {
      "Sour Dough": 24,
      Croissant: 24,
      "Cinnamon Roll": 25.246,
      Toaster: 9,
      "Slime Bread": 9,
      "Robo Bread": 7,
      "Gold Bread": 1.5,
      "Holy Bread": 0.25,
      "Golden Toaster": 0.004,
    }),
  },
  {
    // Shows in the shop now, opens December 1 (seasonalPackOpensAt in market-stock.ts).
    // One cookie is in the pool each day: Chocolate Candy -> Sugar -> Macadamia Nut -> Gingerbread.
    name: "Winter Bag",
    price: 25,
    seasonal: true,
    // Same tiers as the other packs, so the average resale (~17) stays under the price.
    // Mythic fixed at 0.3%: by pool size alone this big bag would give Frozen Ted 0.7%.
    rarityChances: { Epic: 6, Legendary: 1.5, Mythic: 0.3, Secret: 0.09 },
    art: "/assets/winter-bag-3.svg",
    pool: dailyRotation(rewards([
      ["Snowball", "Common"],
      ["Mitten", "Common"],
      ["Christmas Candy", "Common"],
      ["Santa Hat", "Uncommon"],
      ["Ornament", "Uncommon"],
      ["Chocolate Coin", "Uncommon"],
      ["Stocking", "Rare"],
      ["Chocolate Candy Cookie", "Rare"],
      ["Sugar Cookie", "Rare"],
      ["Macadamia Nut Cookie", "Rare"],
      ["Gingerbread Cookie", "Rare"],
      ["Present", "Epic"],
      ["Fireplace", "Epic"],
      ["Festive Breadlet", "Legendary"],
      ["Frozen Ted", "Mythic"],
      ["Reindeer", "Secret"],
      ["Christmas Tree Dragon", "Breadled"],
    ], {}, { "Christmas Tree Dragon": 0.005 }), ["Chocolate Candy Cookie", "Sugar Cookie", "Macadamia Nut Cookie", "Gingerbread Cookie"]),
  },
  {
    // Shows in the shop now, opens November 1 (seasonalPackOpensAt in market-stock.ts).
    // More Breadlets are coming to this pack.
    name: "Fall Bag",
    price: 25,
    seasonal: true,
    // Same tier odds as the Winter Bag (no Epic yet).
    rarityChances: { Epic: 6, Legendary: 1.5, Secret: 0.01 },
    art: "/assets/fall-bag-2.svg",
    pool: rewards([
      ["Pumpkin", "Common"],
      ["Chai Tea", "Common"],
      ["Cherry Pie", "Uncommon"],
      ["Pumpkin Pie", "Uncommon"],
      ["Corn", "Rare"],
      ["Cooked Turkey", "Legendary"],
      ["Caramel Apple", "Secret"],
      ["Tanuki", "Breadled"],
    ], {}, { Tanuki: 0.005 }),
  },
];

export const legacyCapsules: Capsule[] = [
  // Not a real bag: the Breadlets bought with leaves in the Fall Fiesta (lib/fall-fiesta.ts).
  {
    name: "Fall Fiesta",
    price: 0,
    art: "/assets/fall/fall-leaf.webp",
    retired: true,
    seasonal: true,
    pool: rewards([
      ["Acorn", "Unique"],
      ["Pilgrim Hat", "Unique"],
      ["Fall Leaf", "Unique"],
      ["Pumpkin Dragon", "Unique"],
    ]),
  },
  {
    name: "Legacy Bread Bag",
    price: 25,
    art: "/assets/Bread bag.svg",
    retired: true,
    pool: rewards([
      ["Sour Dough", "Common"],
      ["Burnt Toast", "Common"],
      ["Brioche", "Common"],
      ["Donut", "Uncommon"],
      ["Cinnamon Roll", "Uncommon"],
      ["Holy Bread", "Mythic"],
    ]),
  },
  {
    name: "Pixel Bag",
    price: 25,
    art: "/assets/right sized pixel bag.png",
    retired: true,
    pool: rewards([
      ["Pixel Apple", "Common"],
      ["Pixel Caramel", "Common"],
      ["Pixel Crystal Ball", "Uncommon"],
      ["Pixel Bomb", "Rare"],
      ["Pixel Constellation", "Rare"],
      ["Pixel Aztec Coin", "Epic"],
      ["Pixel Lagoon", "Legendary"],
      ["Pixel Sprinkle Bread", "Mythic"],
    ]),
  },
  {
    name: "Human Bag",
    price: 25,
    art: "/assets/human bag.svg",
    retired: true,
    pool: rewards([
      ["Worker", "Common"],
      ["Chef", "Uncommon"],
      ["Doctor", "Rare"],
      ["Ninja", "Epic"],
      ["Actor", "Legendary"],
      ["Caveman", "Mythic"],
    ]),
  },
  {
    name: "Remix Bag",
    price: 25,
    art: "/assets/remix bag.svg",
    retired: true,
    pool: rewards([
      ["Red Rex", "Breadled"],
      ["Albino Crow", "Uncommon"],
      ["Mr. Frog", "Uncommon"],
      ["Crimson Octopus", "Mythic"],
      ["Lava Slime", "Rare"],
      ["Burnt Toast", "Common"],
    ]),
  },
];

// Power Hour: 3x luck on Goodybags for an hour every 3 hours. It starts 30 minutes before a Fall
// Fiesta leaf shower (those fall on every UTC hour): 02:30-03:30, 05:30-06:30, ... UTC.
// The server rolls with luckyChanceFor, so the boost can't be faked.
export const POWER_HOUR_LUCK = 3;
const POWER_HOUR_EVERY = 3 * 3600000;
const POWER_HOUR_OFFSET = 2.5 * 3600000;
const POWER_HOUR_LENGTH = 3600000;
export const powerHourAt = (now: number) => {
  const startsAt = Math.floor((now - POWER_HOUR_OFFSET) / POWER_HOUR_EVERY) * POWER_HOUR_EVERY + POWER_HOUR_OFFSET;
  const endsAt = startsAt + POWER_HOUR_LENGTH;
  return { live: now < endsAt, startsAt, endsAt, nextAt: startsAt + POWER_HOUR_EVERY };
};
// Legendary and rarer Breadlets are 3x as likely; everything else shrinks so the odds still add up.
const luckyRarity = (rarity: string) => rarityOrder.indexOf(rarity) >= rarityOrder.indexOf("Legendary");
export const luckyChanceFor = (capsule: Capsule, reward: Reward, date = new Date()) => {
  const chance = chanceFor(capsule, reward, date);
  if (!chance || !powerHourAt(date.getTime()).live) return chance;
  const total = capsule.pool.reduce((sum, item) => sum + chanceFor(capsule, item, date), 0);
  const boosted = capsule.pool.reduce((sum, item) => sum + chanceFor(capsule, item, date) * (luckyRarity(item.rarity) ? POWER_HOUR_LUCK : 1), 0);
  return boosted ? (chance * (luckyRarity(reward.rarity) ? POWER_HOUR_LUCK : 1) * total) / boosted : chance;
};
