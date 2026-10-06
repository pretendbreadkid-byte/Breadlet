export type Reward = { name: string; rarity: string; weight: number; art?: string };

export type Capsule = {
  name: string;
  price: number;
  art: string;
  pool: Reward[];
  retired?: boolean;
  note?: string;
};

export const rarityBudget: Record<string, number> = {
  Common: 50,
  Uncommon: 25,
  Rare: 15,
  Epic: 9.3,
  Legendary: 0.5,
  Mythic: 0.2,
  Unique: 0.2,
  Transcendent: 0.025,
};

export const rewards = (
  items: [string, string][],
  artNames: Record<string, string> = {},
) =>
  items.map(([name, rarity]) => ({
    name,
    rarity,
    weight: rarityBudget[rarity] || 0.1,
    art: artNames[name],
  }));

export const chanceFor = (capsule: Capsule, reward: Reward) => {
  const total = Array.from(new Set(capsule.pool.map((item) => item.rarity))).reduce(
    (sum, rarity) => sum + (rarityBudget[rarity] || 0.1), 0,
  );
  const sameRarity =
    capsule.pool.filter((item) => item.rarity === reward.rarity).length || 1;
  return ((rarityBudget[reward.rarity] || 0.1) / sameRarity / total) * 100;
};

export const sellValueFor = (rarity: string) =>
  ({
    Common: 5,
    Uncommon: 12,
    Rare: 15,
    Epic: 75,
    Legendary: 150,
    Mythic: 300,
    Unique: 500,
    Transcendent: 1000,
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

export const wheelRewards = [
  { label: "250 tokens", type: "tokens", amount: 250, chance: 32.5 },
  { label: "500 tokens", type: "tokens", amount: 500, chance: 25 },
  { label: "1,000 tokens", type: "tokens", amount: 1000, chance: 18 },
  { label: "2,000 tokens", type: "tokens", amount: 2000, chance: 10 },
  { label: "3,000 tokens", type: "tokens", amount: 3000, chance: 5 },
  { label: "4,000 tokens", type: "tokens", amount: 4000, chance: 3.5 },
  { label: "5,000 tokens", type: "tokens", amount: 5000, chance: 1 },
  { label: "5 Gold", type: "material", material: "Gold", amount: 5, chance: 2.5 },
  { label: "5 Gem", type: "material", material: "Gem", amount: 5, chance: 2.5 },
] as const;

export const materialFor = (name: string, rarity: string) =>
  rarity === "Mythic" || rarity === "Transcendent"
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

export const liveCapsules: Capsule[] = [
  {
    name: "Inventions Bag",
    price: 25,
    art: "/assets/invetion goodie bag.svg",
    pool: rewards([
      ["Wheel", "Common"],
      ["Letter", "Uncommon"],
      ["Gears", "Rare"],
      ["Da Vinci's Ornithopter", "Epic"],
      ["Leonardo da Vinci's Tank", "Epic"],
      ["Leonardo da Vinci", "Legendary"],
      ["Bitcoin", "Mythic"],
    ]),
  },
  {
    name: "Space Bag",
    price: 25,
    art: "/assets/space bag updated again.svg",
    pool: rewards([
      ["Mars", "Common"],
      ["Earth", "Uncommon"],
      ["Star", "Rare"],
      ["Space Trooper", "Rare"],
      ["Consolation", "Rare"],
      ["Eclipse", "Epic"],
      ["Alien", "Mythic"],
      ["Star Ship", "Transcendent"],
    ]),
  },
  {
    name: "Lost and Found Bag",
    price: 25,
    art: "/assets/lost and found bag right size .png",
    pool: rewards([
      ["Car Keys", "Common"],
      ["Comb", "Common"],
      ["Hat", "Uncommon"],
      ["Textbook", "Rare"],
      ["Tablet", "Legendary"],
      ["Button", "Mythic"],
    ]),
  },
  {
    name: "Food Bag",
    price: 25,
    art: "/assets/food bag updated.svg",
    pool: rewards([
      ["Rock", "Common"],
      ["Apple", "Common"],
      ["Potato", "Common"],
      ["Fries", "Uncommon"],
      ["Egg", "Uncommon"],
      ["Carrot", "Uncommon"],
      ["Candy Corn", "Rare"],
      ["Avocado", "Rare"],
      ["Caramel", "Epic"],
      ["Sprinkle Bread", "Epic"],
      ["Ice Cream", "Legendary"],
      ["Pickle", "Mythic"],
    ]),
  },
  {
    name: "Artifact Bag",
    price: 25,
    art: "/assets/artifact bag.svg",
    pool: rewards([
      ["Aztec Coin", "Common"],
      ["Map", "Uncommon"],
      ["Crystal Ball", "Rare"],
      ["Necklace", "Epic"],
      ["Stone Tablet", "Legendary"],
      ["Timeglass", "Mythic"],
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
    name: "Combat Bag",
    price: 25,
    art: "/assets/combat bag.svg",
    pool: rewards([
      ["Olive Grenade", "Common"],
      ["The Bomb", "Uncommon"],
      ["Golden Grenade", "Rare"],
      ["Shuriken", "Rare"],
      ["Nunchucks", "Epic"],
      ["Spartan", "Legendary"],
      ["Golden Shuriken", "Mythic"],
    ]),
  },
  {
    name: "BlookTuber Bag",
    price: 25,
    art: "/assets/blooktuber bag updatd.svg",
    pool: rewards([
      ["Bread Blook", "Mythic"],
      ["Blooket Life", "Uncommon"],
      ["Blooket Gods", "Rare"],
      ["Fasty Jay", "Epic"],
      ["Lagoon", "Rare"],
      ["Waymore", "Epic"],
    ]),
  },
];

export const retiredCapsules: Capsule[] = [
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
    name: "Bread Bag",
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
    name: "Remix Bag",
    price: 25,
    art: "/assets/remix bag.svg",
    retired: true,
    pool: rewards([
      ["Red Rex", "Transcendent"],
      ["Albino Crow", "Uncommon"],
      ["Mr. Frog", "Uncommon"],
      ["Crimson Octopus", "Mythic"],
      ["Lava Slime", "Rare"],
      ["Burnt Toast", "Common"],
    ]),
  },
];
