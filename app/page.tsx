"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient as createSupabaseClient } from "../lib/supabase/client";
import {
  Backpack,
  CircleUserRound,
  Crown,
  Hammer,
  Lock,
  MessageCircle,
  Pickaxe,
  Percent,
  ShoppingBag,
  Store,
  Trophy,
  Users,
} from "lucide-react";

type Tab =
  | "profile"
  | "capsules"
  | "inventory"
  | "mine"
  | "market"
  | "chat"
  | "leaderboard"
  | "promo"
  | "info"
  | "clan"
  | "crafting"
  | "admin";
type Reward = { name: string; rarity: string; weight: number; art?: string };
type Capsule = {
  name: string;
  price: number;
  art: string;
  pool: Reward[];
  retired?: boolean;
  note?: string;
};
type Listing = { id: number; seller: string; blook: string; price: number };
type Player = {
  username: string;
  password: string;
  tokens: number;
  mined: number;
  inventory: string[];
  equipped: string;
  pickaxe: number;
  listings: Listing[];
  clanTag: string;
  materials: Record<string, number>;
  badges: string[];
  friends?: string[];
};
type NavItem = { id: Tab; label: string; icon: React.ReactNode };

const playerKey = "breadlet-player";
const firstFiftyKey = "breadlet-first-fifty-count";
const badgeDescriptions: Record<string, string> = {
  "First 50": "Awarded to the first 50 players to join Breadlet.",
  Verified: "A verified badge for trusted, well-known community members.",
  BlookTuber: "Awarded to YouTubers who create Breadlet content or similar collectible-game content.",
};
const artFor = (name: string) =>
  ({
    Mars: "/assets/mars.svg",
    Worker: "/assets/worker.svg",
    "Aztec Coin": "/assets/Aztect Coin (1).svg",
    Map: "/assets/map (1).svg",
    "Pixel Toast": "/assets/Pixel bread.png",
    "Pixel Chick": "/assets/pixel-chick.png",
    "Pixel Ice Slime": "/assets/pixel ice slime.png",
    "Lava Slime": "/assets/lava-slime.svg",
    "Olive Grenade": "/assets/grenade.png",
    "Sour Dough": "/assets/Bread.svg",
    "Burnt Toast": "/assets/Burnt toast.svg",
    Brioche: "/assets/brioche.svg",
    Chef: "/assets/chef (1).svg",
    Earth: "/assets/earrth.svg",
    Surgeon: "/assets/surgeon.svg",
    "Crystal Ball": "/assets/crystal ball.svg",
    "Pixel Fuego": "/assets/pixel fuego.png",
    "Pixel Wizard": "/assets/pixel wizard.png",
    "Blooket Life": "/assets/blooket life.jpg",
    Lagoon: "/assets/lagoon.jpg",
    Shuriken: "/assets/shuricken.svg",
    "Albino Crow": "/assets/albino crow.svg",
    Baguette: "/assets/bagget.svg",
    Star: "/assets/star (1).svg",
    "Laser Blaster": "/assets/Blaster (light sword replacement).svg",
    "Yellow Platypus": "/assets/yellowplatypus.svg",
    Eclipse: "/assets/eclipse2.svg",
    Necklace: "/assets/neclase.svg",
    Ninja: "/assets/Ninja.svg",
    Santa: "/assets/santa pixel.png",
    "Fasty Jay": "/assets/fastyjay.jpg",
    Waymore: "/assets/waymore.jpg",
    Shield: "/assets/sheild (1).svg",
    Spartan: "/assets/spartin  (1).svg",
    Solider: "/assets/solider.svg",
    "Gold Bread": "/assets/golden loaf.svg",
    "Stone Tablet": "/assets/Stone tablet (1).svg",
    "Pixel Planet": "/assets/pixel planet.png",
    Actor: "/assets/actor.svg",
    Alien: "/assets/Alien (2).svg",
    "Crimson Octopus": "/assets/crimsonoctopus.svg",
    Caveman: "/assets/caveman.svg",
    Timeglass: "/assets/Time glass final animation.svg",
    "Pixel UFO": "/assets/pixel planet.png",
    "Pixel Alien": "/assets/pixel planet.png",
    "Bread Blook": "/assets/breadblook.jpg",
    "Golden Shuriken": "/assets/golden-shuriken.svg",
    "Holy Bread": "/assets/holy bread.svg",
    "Red Rex": "/assets/red-rex.svg",
    "Golden UFO": "/assets/golden tim the alien.png",
    "Mr. Receipt": "/assets/mr-receipt.svg",
    "Mr. Frog": "/assets/Mr.frog.svg",
    Donut: "/assets/bagel.svg",
    "Cinnamon Roll": "/assets/cinimmon role.svg",
    "Green Astronaut": "/assets/fastyjay.jpg",
    Astronaut: "/assets/fastyjay.jpg",
    Megabot: "/assets/megabot.svg",
    King: "/assets/king.svg",
    Yeti: "/assets/yeti.svg",
    Megalodon: "/assets/megalodon.svg",
    Lion: "/assets/lion.svg",
    "Sugar Glider": "/assets/sugar-glider.svg",
    "Tyrannosaurus Rex": "/assets/tyrannosaurus-rex.svg",
    Sandwich: "/assets/sandwich.svg",
  })[name.replace(/^Shiny /, "")] || "/assets/Bread.svg";
const rarityBudget: Record<string, number> = {
  Common: 50,
  Uncommon: 25,
  Rare: 15,
  Epic: 9.3,
  Legendary: 0.5,
  Mythic: 0.2,
  Unique: 0.2,
  Transcendent: 0.1,
};
const rewards = (
  items: [string, string][],
  artNames: Record<string, string> = {},
) =>
  items.map(([name, rarity]) => ({
    name,
    rarity,
    weight: rarityBudget[rarity] || 0.1,
    art: artNames[name] || artFor(name),
  }));
const chanceFor = (capsule: Capsule, reward: Reward) => {
  const total = capsule.pool.reduce(
    (sum, item) => sum + (rarityBudget[item.rarity] || 0.1),
    0,
  );
  const sameRarity =
    capsule.pool.filter((item) => item.rarity === reward.rarity).length || 1;
  return ((rarityBudget[reward.rarity] || 0.1) / sameRarity / total) * 100;
};
const rarityClassFor = (rarity: string) =>
  rarity === "Unique"
    ? "rarity-unique"
    : rarity === "Transcendent"
      ? "rarity-transcendent"
      : "";
const rewardEffectClassFor = (name: string, rarity: string) =>
  `${rarityClassFor(rarity)} ${name === "Pixel Alien" || name === "Bread Blook" ? "rainbow-blook" : ""} ${name === "Golden Shuriken" || name === "Holy Bread" ? "golden-glow" : ""} ${name === "Red Rex" ? "red-rex-bounce" : ""} ${name === "Crimson Octopus" ? "crimson-octopus-glow" : ""}`;
const sellValueFor = (rarity: string) =>
  ({
    Common: 5,
    Uncommon: 12,
    Rare: 30,
    Epic: 75,
    Legendary: 150,
    Mythic: 300,
    Unique: 500,
    Transcendent: 1000,
  })[rarity] || 5;
const shinyEligibleNames = new Set(["Mars", "Aztec Coin", "Worker", "Olive Grenade", "Green Astronaut"]);
const shinyNameFor = (name: string) => shinyEligibleNames.has(name) && Math.floor(Math.random() * 100) === 0 ? `Shiny ${name}` : name;
const materialNames = [
  "Flour",
  "Metal",
  "Gem",
  "Gold",
  "Cloth",
  "Sugar",
];

function playerFromServer(data: any): Player {
  return {
    username: data.profile.username,
    password: "",
    tokens: data.profile.tokens || 0,
    mined: data.mine?.current_earnings_today || 0,
    inventory: data.inventory?.length ? data.inventory : ["Bread Blook"],
    equipped: data.profile.equipped_blook_name || data.inventory?.[0] || "Bread Blook",
    pickaxe: Math.max(0, (data.mine?.pickaxe_level || 1) - 1),
    listings: [],
    clanTag: data.profile.clan_tag || "",
    materials: { ...emptyMaterials(), ...(data.materials || {}) },
    badges: data.profile.badges || [],
    friends: data.profile.friends || [],
  };
}
const materialFor = (name: string, rarity: string) =>
  rarity === "Mythic" || rarity === "Transcendent"
    ? "Gold"
    : rarity === "Legendary"
      ? "Gem"
      : name.toLowerCase().includes("bread") ||
          name.toLowerCase().includes("toast") ||
          name.toLowerCase().includes("dough")
        ? "Flour"
        : name.toLowerCase().includes("grenade") ||
            name.toLowerCase().includes("shuriken") ||
            name.toLowerCase().includes("blaster")
          ? "Metal"
          : name.toLowerCase().includes("crystal") ||
              name.toLowerCase().includes("glass")
            ? "Gem"
            : materialNames[name.length % materialNames.length];
type MaterialBundle = Record<string, number>;
const bundleEntries = (bundle: MaterialBundle) => Object.entries(bundle);
const dismantleBundleFor = (name: string, rarity: string): MaterialBundle => {
  const primary = materialFor(name, rarity);
  const primaryIndex = materialNames.indexOf(primary);
  const secondary = materialNames[(primaryIndex + name.length + rarity.length) % materialNames.length];
  return {
    [primary]: 3,
    [secondary === primary ? materialNames[(primaryIndex + 1) % materialNames.length] : secondary]: 2,
  };
};
const craftRecipes: { name: string; ingredients: MaterialBundle }[] = [
  { name: "Lion", ingredients: { Flour: 12, Sugar: 8 } },
  { name: "Astronaut", ingredients: { Gem: 12, Gold: 8 } },
  { name: "Yeti", ingredients: { Metal: 12, Gold: 8 } },
  { name: "Sandwich", ingredients: { Cloth: 12, Flour: 8 } },
  { name: "Butterfly", ingredients: { Sugar: 12, Gem: 8 } },
  { name: "Blackbird", ingredients: { Gem: 12, Cloth: 8 } },
  { name: "Sugar Glider", ingredients: { Sugar: 12, Cloth: 8 } },
  { name: "Tyrannosaurus Rex", ingredients: { Metal: 12, Flour: 8 } },
  { name: "Megalodon", ingredients: { Gold: 12, Gem: 8 } },
  { name: "Megabot", ingredients: { Metal: 12, Gem: 8 } },
  { name: "King", ingredients: { Gold: 12, Cloth: 8 } },
];
const craftRecipeFor = (name: string) =>
  craftRecipes.find((recipe) => recipe.name === name);
const materialArtFor = (material: string) =>
  ({
    Flour: "/assets/flower.svg",
    Metal: "/assets/metal.svg",
    Gem: "/assets/gem.svg",
    Gold: "/assets/gold.svg",
    Cloth: "/assets/cloth.svg",
    Sugar: "/assets/sugar.svg",
  })[material] || "/assets/flower.svg";
const emptyMaterials = () =>
  materialNames.reduce<Record<string, number>>((all, material) => {
    all[material] = 0;
    return all;
  }, {});
const liveCapsules: Capsule[] = [
  {
    name: "Space Capsule",
    price: 25,
    art: "/assets/space-capsule-new.svg",
    pool: rewards([
      ["Mars", "Common"],
      ["Earth", "Uncommon"],
      ["Star", "Rare"],
      ["Laser Blaster", "Rare"],
      ["Eclipse", "Epic"],
      ["Alien", "Mythic"],
    ]),
  },
  {
    name: "Human Capsule",
    price: 25,
    art: "/assets/human-capsule-new.svg",
    pool: rewards([
      ["Worker", "Common"],
      ["Chef", "Uncommon"],
      ["Surgeon", "Rare"],
      ["Ninja", "Epic"],
      ["Actor", "Legendary"],
      ["Caveman", "Mythic"],
    ]),
  },
  {
    name: "Artifact Capsule",
    price: 25,
    art: "/assets/new new artifact pack.svg",
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
    name: "Pixel Capsule",
    price: 25,
    art: "/assets/pixel-capsule-new.svg",
    pool: rewards([
      ["Pixel Toast", "Common"],
      ["Pixel Chick", "Common"],
      ["Pixel Ice Slime", "Uncommon"],
      ["Lava Slime", "Uncommon"],
      ["Pixel Fuego", "Rare"],
      ["Pixel Wizard", "Rare"],
      ["Pixel Planet", "Legendary"],
      ["Pixel Alien", "Mythic"],
    ]),
  },
  {
    name: "Combat Capsule",
    price: 25,
    art: "/assets/combat-capsule-new.svg",
    pool: rewards([
      ["Olive Grenade", "Common"],
      ["Shuriken", "Rare"],
      ["Shield", "Epic"],
      ["Spartan", "Legendary"],
      ["Golden Shuriken", "Mythic"],
    ]),
  },
  {
    name: "BlookTuber Capsule",
    price: 25,
    art: "/assets/blooktuber-capsule-new.svg",
    pool: rewards([
      ["Blooket Life", "Uncommon"],
      ["Green Astronaut", "Uncommon"],
      ["Blooket Gods", "Rare"],
      ["Fasty Jay", "Epic"],
      ["Waymore", "Epic"],
      ["Bread Blook", "Mythic"],
    ]),
  },
];
const retiredCapsules: Capsule[] = [
  {
    name: "Bread Box",
    price: 25,
    art: "/assets/bread-capsule.svg",
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
    name: "Remix Box",
    price: 25,
    art: "/assets/remix-capsule.svg",
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
const upgrades = [
  { name: "Basic Rock", art: "/assets/basic-rock.svg", cost: 0 },
  { name: "Topaz Pick", art: "/assets/topaz-rock.svg", cost: 250 },
  { name: "Diamond Pick", art: "/assets/diamond-rock.svg", cost: 750 },
  { name: "Emerald Pick", art: "/assets/emerald-rock.svg", cost: 1500 },
  { name: "Gold Pick", art: "/assets/gold-rock.svg", cost: 3000 },
];
const mineCapFor = (pickaxe: number) => [500, 1500, 2500, 3500, 4250, 5000][pickaxe] || 5000;

export default function HomePage() {
  const [player, setPlayer] = useState<Player | null>(null);
  const [supabaseClient] = useState(() => createSupabaseClient());
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tab, setTab] = useState<Tab>("profile");
  const [notice, setNotice] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [showRetired, setShowRetired] = useState(false);
  const [reveal, setReveal] = useState<{
    capsule: Capsule;
    reward: Reward;
    phase: "wiggle" | "dark" | "result";
  } | null>(null);
  const [oddsCapsule, setOddsCapsule] = useState<Capsule | null>(null);
  const [badgeInfo, setBadgeInfo] = useState<string | null>(null);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [massOpen, setMassOpen] = useState(false);
  const [massQuantities, setMassQuantities] = useState<Record<string, number>>({});
  const [massResults, setMassResults] = useState<{ capsule: string; reward: Reward }[]>([]);
  const [pendingDismantle, setPendingDismantle] = useState<string | null>(null);
  const [craftReveal, setCraftReveal] = useState<{ name: string; ingredients: MaterialBundle; phase: "processing" | "output" } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [giftChatNotice, setGiftChatNotice] = useState("");

  useEffect(() => {
    if (supabaseClient) {
      supabaseClient.auth.getUser().then(async ({ data }) => {
        if (!data.user) return;
        const response = await fetch("/api/player");
        if (response.ok) setPlayer(playerFromServer(await response.json()));
      });
      return;
    }
    const saved = window.localStorage.getItem(playerKey);
    if (saved) {
      const old = JSON.parse(saved);
      if (old.password)
        setPlayer({
          listings: [],
          pickaxe: 0,
          clanTag: "",
          ...old,
          materials: { ...emptyMaterials(), ...(old.materials || {}) },
          badges: old.badges || [],
          friends: old.friends || [],
        });
    }
  }, [supabaseClient]);
  useEffect(() => {
    const logo = document.querySelector('header img[alt="Breadlet logo"]');
    if (!logo) return;
    const goToProfile = () => setTab("profile");
    logo.addEventListener("click", goToProfile);
    return () => logo.removeEventListener("click", goToProfile);
  }, []);
  const save = (next: Player) => {
    setPlayer(next);
    window.localStorage.setItem(playerKey, JSON.stringify(next));
  };
  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (username.trim().length < 3 || password.length < 4) {
      setNotice(
        "Use a username with 3+ characters and a password with 4+ characters.",
      );
      return;
    }
    if (supabaseClient) {
      if (!email.trim()) {
        setNotice("Enter an email address for Supabase Auth.");
        return;
      }
      let result = await supabaseClient.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) {
        const signup = await supabaseClient.auth.signUp({ email: email.trim(), password, options: { data: { username: username.trim() } } });
        if (signup.error || !signup.data.session) {
          setNotice(signup.error?.message || "Check your email to confirm the account, then log in.");
          return;
        }
      }
      await fetch("/api/player", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: username.trim(), tokens: 250, materials: emptyMaterials() }) });
      const response = await fetch("/api/player");
      if (response.ok) {
        setPlayer(playerFromServer(await response.json()));
        setNotice("Signed in with Supabase.");
      }
      return;
    }
    const firstFiftyCount = Number(window.localStorage.getItem(firstFiftyKey) || "0");
    const badges = firstFiftyCount < 50 ? ["First 50"] : [];
    window.localStorage.setItem(firstFiftyKey, String(Math.min(50, firstFiftyCount + 1)));
    save({
      username: username.trim(),
      password,
      tokens: 250,
      mined: 0,
      inventory: ["Bread Blook"],
      equipped: "Bread Blook",
      pickaxe: 0,
      listings: [],
      clanTag: "",
      materials: emptyMaterials(),
      badges,
      friends: [],
    });
    setNotice("Welcome to Breadlet.");
  };
  const mine = () => {
    if (!player) return;
    const dailyCap = mineCapFor(player.pickaxe);
    const amount = Math.min(25, dailyCap - player.mined);
    if (!amount) {
      setNotice(`You reached today's ${dailyCap.toLocaleString()} token limit.`);
      return;
    }
    save({
      ...player,
    tokens: player.tokens + amount,
      mined: player.mined + amount,
    });
    setNotice(`+${amount} tokens mined.`);
  };
  const openCapsule = (capsule: Capsule) => {
    if (!player) return;
    if (player.tokens < capsule.price) {
      setNotice("You need more tokens for that capsule.");
      return;
    }
    const total = capsule.pool.reduce(
      (sum, reward) => sum + chanceFor(capsule, reward),
      0,
    );
    let roll = Math.random() * total;
      const reward = capsule.pool.find((item) => {
        roll -= chanceFor(capsule, item);
        return roll <= 0;
      }) || capsule.pool[0];
    const finalReward = { ...reward, name: shinyNameFor(reward.name) };
    const next = { ...player, tokens: player.tokens - capsule.price };
    save(next);
    setReveal({ capsule, reward: finalReward, phase: "wiggle" });
    window.setTimeout(
      () =>
        setReveal((current) =>
          current ? { ...current, phase: "dark" } : null,
        ),
      900,
    );
    window.setTimeout(() => {
      save({ ...next, inventory: [...next.inventory, finalReward.name] });
      setReveal({ capsule, reward: finalReward, phase: "result" });
    }, 1700);
  };
  const openMassCapsules = (quantities: Record<string, number>) => {
    if (!player) return;
    const selected = liveCapsules.flatMap((capsule) =>
      Array.from({ length: quantities[capsule.name] || 0 }, () => capsule),
    );
    const cost = selected.reduce((total, capsule) => total + capsule.price, 0);
    if (!selected.length) {
      setNotice("Choose at least one capsule to mass open.");
      return;
    }
    if (player.tokens < cost) {
      setNotice("You need more tokens for that mass opening.");
      return;
    }
    const results = selected.map((capsule) => {
      const total = capsule.pool.reduce(
        (sum, reward) => sum + chanceFor(capsule, reward),
        0,
      );
      let roll = Math.random() * total;
      const reward =
        capsule.pool.find((item) => {
          roll -= chanceFor(capsule, item);
          return roll <= 0;
        }) || capsule.pool[0];
      return { capsule: capsule.name, reward: { ...reward, name: shinyNameFor(reward.name) } };
    });
    save({
      ...player,
      tokens: player.tokens - cost,
      inventory: [...player.inventory, ...results.map((result) => result.reward.name)],
    });
    setMassOpen(false);
    setMassQuantities({});
    setMassResults(results);
  };
  const equip = (name: string) => {
    if (player) {
      save({ ...player, equipped: name });
      setNotice(`${name} equipped.`);
    }
  };
  const sell = (name: string) => {
    if (!player || player.inventory.length <= 1) return;
    const index = player.inventory.indexOf(name);
    const inventory = player.inventory.filter((_, itemIndex) => itemIndex !== index);
    const value = sellValueFor(rarityFor(name));
    save({
      ...player,
      tokens: player.tokens + value,
      inventory,
      equipped: player.equipped === name ? inventory[0] : player.equipped,
    });
    setNotice(`${name} sold for ${value} tokens.`);
  };
  const buyUpgrade = (index: number) => {
    if (!player || index <= player.pickaxe) return;
    const upgrade = upgrades[index];
    if (player.tokens < upgrade.cost) {
      setNotice(`You need ${upgrade.cost} tokens for ${upgrade.name}.`);
      return;
    }
    save({ ...player, tokens: player.tokens - upgrade.cost, pickaxe: index });
    setNotice(`${upgrade.name} equipped.`);
  };
  const createListing = (blook: string, price: number) => {
    if (
      !player ||
      !player.inventory.includes(blook) ||
      price > 100000 ||
      price < 1
    ) {
      setNotice("Choose an owned Blook and a price from 1 to 100,000.");
      return;
    }
    const listing = { id: Date.now(), seller: player.username, blook, price };
    save({ ...player, listings: [...player.listings, listing] });
    setNotice(`${blook} listed in the Bazaar.`);
  };
  const buyListing = (listing: Listing) => {
    if (!player) return;
    if (player.tokens < listing.price) {
      setNotice("You need more tokens for this listing.");
      return;
    }
    save({ ...player, tokens: player.tokens - listing.price, inventory: [...player.inventory, listing.blook], listings: player.listings.filter((item) => item.id !== listing.id) });
    setSelectedListing(null);
    setNotice(`${listing.blook} purchased.`);
  };
  const redeemPromo = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!player) return;
    if (promoCode.trim() === "Breadlet2.0") {
      save({ ...player, tokens: player.tokens + 1000 });
      setNotice("Promo redeemed: +1,000 tokens.");
    } else if (promoCode.trim() === "admin1234532!") {
      setAdminUnlocked(true);
      setTab("admin");
      setNotice("Demo admin panel unlocked.");
    } else setNotice("That promo code is not active.");
  };
  const grantTokens = (amount: number) => {
    if (adminUnlocked && player) {
      save({ ...player, tokens: player.tokens + amount });
      setNotice(`Admin grant: +${amount} tokens.`);
    }
  };
  const grantBlook = (name: string) => {
    if (adminUnlocked && player) {
      save({ ...player, inventory: [...player.inventory, name] });
      setNotice(`Admin grant: ${name} added.`);
    }
  };
  const grantBadge = (name: string) => {
    if (adminUnlocked && player && !player.badges.includes(name)) {
      save({ ...player, badges: [...player.badges, name] });
      setNotice(`Admin grant: ${name} badge added.`);
    }
  };
  const salvage = (name: string) => {
    if (!player || player.inventory.length <= 1) return;
    const index = player.inventory.indexOf(name);
    const inventory = player.inventory.filter(
      (_, itemIndex) => itemIndex !== index,
    );
    const bundle = dismantleBundleFor(name, rarityFor(name));
    save({
      ...player,
      inventory,
      equipped: player.equipped === name ? inventory[0] : player.equipped,
      materials: {
        ...player.materials,
        ...Object.fromEntries(
          bundleEntries(bundle).map(([material, amount]) => [
            material,
            (player.materials[material] || 0) + amount,
          ]),
        ),
      },
    });
    setNotice(`${name} dismantled into a five-material bundle.`);
  };
  const craft = (name: string) => {
    const recipe = craftRecipeFor(name);
    if (!player || !recipe) return;
    const missing = bundleEntries(recipe.ingredients).find(
      ([material, amount]) => (player.materials[material] || 0) < amount,
    );
    if (missing) {
      setNotice(`You need more ${missing[0]} to craft ${name}.`);
      return;
    }
    const materials = { ...player.materials };
    bundleEntries(recipe.ingredients).forEach(([material, amount]) => {
      materials[material] = (materials[material] || 0) - amount;
    });
    const next = { ...player, materials };
    save(next);
    setCraftReveal({ name, ingredients: recipe.ingredients, phase: "processing" });
    window.setTimeout(() => {
      save({ ...next, inventory: [...next.inventory, name] });
      setCraftReveal({ name, ingredients: recipe.ingredients, phase: "output" });
    }, 1600);
  };
  const setClan = (tag: string) => {
    if (player) {
      save({ ...player, clanTag: tag.trim().slice(0, 5).toUpperCase() });
      setNotice(
        `Clan tag set to ${tag.trim().slice(0, 5).toUpperCase() || "none"}.`,
      );
    }
  };
  if (!player)
    return (
      <LoginScreen
        username={username}
        email={email}
        password={password}
        setUsername={setUsername}
        setEmail={setEmail}
        setPassword={setPassword}
        login={login}
        notice={notice}
      />
    );
  const nav: NavItem[] = [
    {
      id: "profile",
      label: "Profile",
      icon: <CircleUserRound size={20} strokeWidth={2.2} />,
    },
    {
      id: "capsules",
      label: "Capsules",
      icon: <Store size={20} strokeWidth={2.2} />,
    },
    {
      id: "inventory",
      label: "Collection",
      icon: <Backpack size={20} strokeWidth={2.2} />,
    },
    {
      id: "mine",
      label: "Mine",
      icon: <Pickaxe size={20} strokeWidth={2.2} />,
    },
    {
      id: "crafting",
      label: "Crafting",
      icon: <Hammer size={20} strokeWidth={2.2} />,
    },
    { id: "clan", label: "Clans", icon: <Users size={20} strokeWidth={2.2} /> },
    {
      id: "market",
      label: "Bazaar",
      icon: <ShoppingBag size={20} strokeWidth={2.2} />,
    },
    {
      id: "chat",
      label: "Chat",
      icon: <MessageCircle size={20} strokeWidth={2.2} />,
    },
    {
      id: "leaderboard",
      label: "Ranks",
      icon: <Trophy size={20} strokeWidth={2.2} />,
    },
    {
      id: "promo",
      label: "Promo",
      icon: <Percent size={20} strokeWidth={2.2} />,
    },
    { id: "info", label: "Info", icon: <span className="font-black text-sm">i</span> },
  ];
  return (
    <main className="breadlet-blue-theme min-h-screen bg-[#24170f] text-white">
      <div className="bread-floaters" aria-hidden="true">
        <img src="/assets/bread-silhouette-loaf.svg" alt="" className="bread-floater bread-floater-one" />
        <img src="/assets/bread-silhouette-oval.svg" alt="" className="bread-floater bread-floater-two" />
        <img src="/assets/bread-silhouette-ring.svg" alt="" className="bread-floater bread-floater-three" />
      </div>
      <header className="sticky top-0 z-20 border-b border-[#d49a4a]/25 bg-[#24170f]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-5 py-3">
          <div className="flex items-center gap-3">
            <img
              src="/assets/breadlet-logo.svg"
              alt="Breadlet logo"
              className="h-16 w-52 object-contain object-left"
            />
            <span className="hidden text-xs font-black uppercase tracking-[0.25em] text-[#eac477] md:block">
              Breadlet
            </span>
          </div>
          <div className="flex items-center gap-3">
            <nav className="hidden items-center gap-1 rounded-xl bg-[#3a2415] p-1 md:flex">
              {nav.filter((item) => item.id !== "promo" && item.id !== "info").map((item) => (
                <button
                  title={item.label}
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  className={`rounded-lg px-2.5 py-2 text-lg transition ${tab === item.id ? "bg-[#e9bd67] text-[#29170c]" : "text-[#cdb18c] hover:bg-[#6c4328]/40 hover:text-white"}`}
                >
                  {item.icon}
                </button>
              ))}
            </nav>
            <div className="flex items-center gap-2 rounded-full border border-[#eac477]/30 bg-[#eac477]/10 px-3 py-2 font-black text-[#ffe2a0]">
              <img src="/assets/coin.svg" alt="" className="h-6 w-6" />
              {player.tokens}
            </div>
            <button
              onClick={() => {
                setPlayer(null);
                supabaseClient?.auth.signOut();
                window.localStorage.removeItem(playerKey);
              }}
              className="rounded-lg px-3 py-2 text-xs font-bold text-[#e5c59b]"
            >
              Log out
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-[1500px] gap-1 overflow-x-auto px-5 pb-3 md:hidden">
          {nav.filter((item) => item.id !== "promo" && item.id !== "info").map((item) => (
            <button
              title={item.label}
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-bold transition ${tab === item.id ? "bg-[#e9bd67] text-[#29170c]" : "text-[#cdb18c] hover:bg-[#6c4328]/40 hover:text-white"}`}
            >
              {item.icon} {item.label}
            </button>
          ))}
        </nav>
      </header>
      <section className="mx-auto max-w-[1500px] px-5 py-8">
        {notice && (
          <div className="modal-layer fixed inset-0 z-[9999] flex min-h-screen items-center justify-center bg-black/55 px-5 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl border border-[#73c8ff] bg-[#18558f] p-6 text-center shadow-2xl">
              <p className="text-lg font-black text-[#bde8ff]">Breadlet update</p>
              <p className="mt-3 text-sm text-[#d9f3ff]">{notice}</p>
              <button onClick={() => setNotice("")} className="mt-5 w-full rounded-xl bg-[#39a8f5] px-4 py-3 font-black text-[#031426]">Close</button>
            </div>
          </div>
        )}
        {tab === "profile" && <ProfileTab player={player} setTab={setTab} showBadge={setBadgeInfo} savePlayer={save} />}
        {tab === "capsules" && (
          <CapsulesTab
            showRetired={showRetired}
            setShowRetired={setShowRetired}
            openCapsule={openCapsule}
            showOdds={setOddsCapsule}
            openMass={() => setMassOpen(true)}
            playerTokens={player.tokens}
          />
        )}
        {tab === "inventory" && (
          <InventoryTab player={player} equip={equip} sell={sell} />
        )}
        {tab === "mine" && (
          <MineTab player={player} mine={mine} buyUpgrade={buyUpgrade} />
        )}
        {tab === "market" && (
          <Bazaar player={player} createListing={createListing} openListing={setSelectedListing} />
        )}
        {tab === "chat" && <ChatTab player={player} showBadge={setBadgeInfo} giftNotice={giftChatNotice} />}
        {tab === "leaderboard" && <Leaderboard player={player} />}
        {tab === "clan" && <ClanTab player={player} setClan={setClan} savePlayer={save} />}
        {tab === "crafting" && (
          <CraftingTab player={player} salvage={(name) => setPendingDismantle(name)} craft={craft} />
        )}
        {tab === "promo" && (
          <PromoTab
            code={promoCode}
            setCode={setPromoCode}
            redeem={redeemPromo}
          />
        )}
        {tab === "info" && <InfoTab />}
        {tab === "admin" && adminUnlocked && (
          <AdminTab
            player={player}
            grantTokens={grantTokens}
            grantBlook={grantBlook}
            grantBadge={grantBadge}
            announcement={announcement}
            setAnnouncement={setAnnouncement}
            publishAnnouncement={() => setNotice(announcement.trim() ? `Announcement published: ${announcement.trim()}` : "Write an announcement first.")}
            grantGift={(gift) => {
              save({
                ...player,
                tokens: player.tokens + gift.tokens,
                inventory: [...player.inventory, ...gift.blooks],
                badges: Array.from(new Set([...player.badges, ...gift.badges])),
                materials: Object.fromEntries(materialNames.map((material) => [material, (player.materials[material] || 0) + (gift.materials[material] || 0)])),
              });
              const giftText = `${gift.title || "Admin gift"}: ${gift.message || "Gift received"}`;
              setGiftChatNotice(giftText);
              setNotice(`${giftText} · gift sent.`);
            }}
          />
        )}
      </section>
      {reveal && <RevealModal reveal={reveal} close={() => setReveal(null)} />}
      {oddsCapsule && (
        <OddsModal capsule={oddsCapsule} close={() => setOddsCapsule(null)} />
      )}
      {massOpen && (
        <MassOpenModal
          quantities={massQuantities}
          setQuantity={(name, quantity) =>
            setMassQuantities((current) => ({ ...current, [name]: quantity }))
          }
          close={() => setMassOpen(false)}
          open={openMassCapsules}
        />
      )}
      {massResults.length > 0 && (
        <MassResultsModal results={massResults} close={() => setMassResults([])} />
      )}
      {pendingDismantle && (
        <DismantleConfirmModal
          name={pendingDismantle}
          bundle={dismantleBundleFor(pendingDismantle, rarityFor(pendingDismantle))}
          confirm={() => {
            salvage(pendingDismantle);
            setPendingDismantle(null);
          }}
          close={() => setPendingDismantle(null)}
        />
      )}
      {craftReveal && (
        <CraftingMachineModal
          name={craftReveal.name}
          ingredients={craftReveal.ingredients}
          phase={craftReveal.phase}
          close={() => setCraftReveal(null)}
        />
      )}
      {badgeInfo && <BadgeModal badge={badgeInfo} close={() => setBadgeInfo(null)} />}
      {selectedListing && <ListingModal listing={selectedListing} close={() => setSelectedListing(null)} buy={buyListing} />}
    </main>
  );
}

function LoginScreen({
  username,
  email,
  password,
  setUsername,
  setEmail,
  setPassword,
  login,
  notice,
}: {
  username: string;
  email: string;
  password: string;
  setUsername: (value: string) => void;
  setEmail: (value: string) => void;
  setPassword: (value: string) => void;
  login: (event: FormEvent<HTMLFormElement>) => void;
  notice: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#24170f] px-5 text-white">
      <form
        onSubmit={login}
        className="w-full max-w-md rounded-3xl border border-[#d49a4a]/25 bg-[#3a2415] p-8 shadow-2xl"
      >
        <img
          src="/assets/breadlet-logo.svg"
          alt="Breadlet logo"
          className="mx-auto mb-8 h-24 w-64 object-contain"
        />
        <h1 className="text-center text-3xl font-black">
          Start your collection
        </h1>
        <p className="mt-3 text-center text-sm leading-6 text-[#d7b88c]">
          Create your account and enter the game.
        </p>
        <label
          className="mt-8 block text-xs font-bold uppercase tracking-widest text-[#eac477]"
          htmlFor="username"
        >
          Username
        </label>
        <input
          id="username"
          required
          minLength={3}
          maxLength={20}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="Choose a username"
          className="mt-2 w-full rounded-xl bg-[#24170f] px-4 py-3 outline-none focus:border-[#eac477]"
        />
        <label
          className="mt-5 block text-xs font-bold uppercase tracking-widest text-[#eac477]"
          htmlFor="email"
        >
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="mt-2 w-full rounded-xl bg-[#24170f] px-4 py-3 outline-none focus:border-[#eac477]"
        />
        <label
          className="mt-5 block text-xs font-bold uppercase tracking-widest text-[#eac477]"
          htmlFor="password"
        >
          Password
        </label>
        <input
          id="password"
          required
          minLength={4}
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Create a password"
          className="mt-2 w-full rounded-xl bg-[#24170f] px-4 py-3 outline-none focus:border-[#eac477]"
        />
        {notice && <p className="mt-3 text-sm text-[#ffe2a0]">{notice}</p>}
        <button
          type="submit"
          className="mt-6 w-full rounded-xl bg-[#e9bd67] px-4 py-3 font-black text-[#29170c] hover:bg-[#ffe2a0]"
        >
          Log in / Sign up
        </button>
      </form>
    </main>
  );
}

function ProfileTab({
  player,
  setTab,
  showBadge,
  savePlayer,
}: {
  player: Player;
  setTab: (tab: Tab) => void;
  showBadge: (badge: string) => void;
  savePlayer: (player: Player) => void;
}) {
  const [lookup, setLookup] = useState("");
  const foundUser = lookup.trim() && lookup.trim().toLowerCase() !== player.username.toLowerCase() ? lookup.trim() : "";
  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="profile-hero rounded-3xl border border-[#73c8ff]/45 bg-gradient-to-br from-[#58b8f2] to-[#1677bd] p-7">
        <div className="flex flex-wrap items-center gap-5">
          <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-2xl border border-white/50 bg-[#bde8ff] p-0">
            <img
              src={artFor(player.equipped)}
              alt={player.equipped}
              className="h-full w-full object-cover"
            />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#ffe2a0]">
              Player profile
            </p>
            <h1 className="mt-2 text-4xl font-black">
              {player.username} {player.clanTag && <span className="text-[#ffe2a0]">[{player.clanTag}]</span>}
            </h1>
            <p className="mt-2 text-[#d7b88c]">Equipped: {player.equipped}</p>
            <p className="mt-1 text-xs font-bold uppercase tracking-widest text-[#eac477]">
              {rarityFor(player.equipped)}
            </p>
          </div>
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <Stat label="Tokens" value={player.tokens.toString()} />
          <Stat label="Collection" value={player.inventory.length.toString()} />
          <Stat label="Mined today" value={`${player.mined}/${mineCapFor(player.pickaxe)}`} />
        </div>
      </div>
      <div className="rounded-3xl border border-[#d49a4a]/25 bg-[#3a2415] p-6">
        <h2 className="text-xl font-black">Badges</h2>
        <p className="mt-2 text-sm text-[#d7b88c]">Click a badge to see what it means.</p>
        <div className="mt-5 flex flex-wrap gap-4">
          {player.badges.length ? player.badges.map((badge) => (
            <button key={badge} onClick={() => showBadge(badge)} title={badge} className="rounded-2xl bg-[#24170f] p-2">
              <img src={badge === "First 50" ? "/assets/first-50-badge.svg" : badge === "Verified" ? "/assets/verified-badge.svg" : "/assets/blooktuber-badge.svg"} alt={badge} className="h-16 w-16 object-contain" />
            </button>
          )) : <span className="text-sm text-[#b58d68]">No badges earned yet.</span>}
        </div>
      </div>
      <div className="rounded-3xl border border-[#73c8ff]/45 bg-[#18558f] p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-[#bde8ff]">Social lookup</p>
        <h2 className="mt-1 text-2xl font-black">Find players</h2>
        <div className="mt-4 flex gap-2"><input value={lookup} onChange={(event) => setLookup(event.target.value)} placeholder="Search username" className="min-w-0 flex-1 rounded-xl border border-[#3d91cd] bg-[#103f75] px-3 py-3 text-white" /><button onClick={() => lookup.trim() && setLookup(lookup.trim())} className="rounded-xl bg-[#39a8f5] px-4 py-3 font-black text-[#031426]">Search</button></div>
        {foundUser && <div className="mt-4 flex items-center justify-between rounded-xl bg-[#103f75] p-3"><span className="font-black">{foundUser}</span><button onClick={() => savePlayer({ ...player, friends: Array.from(new Set([...(player.friends || []), foundUser])) })} className="rounded-lg bg-[#39a8f5] px-3 py-2 text-sm font-black text-[#031426]">Add friend</button></div>}
        {!!player.friends?.length && <p className="mt-4 text-sm text-[#d9f3ff]">Friends: {player.friends.join(", ")}</p>}
      </div>
      <div className="flex flex-wrap gap-3 rounded-2xl border border-[#73c8ff]/45 bg-[#18558f] p-4">
        <button onClick={() => setTab("promo")} className="rounded-lg border border-[#3d91cd] px-4 py-2 font-bold text-[#bde8ff]">Promo Codes</button>
        <button onClick={() => setTab("info")} className="rounded-lg border border-[#3d91cd] px-4 py-2 font-bold text-[#bde8ff]">Info & Tutorial</button>
      </div>
    </div>
  );
}

function rarityFor(name: string) {
  const baseName = name.replace(/^Shiny /, "");
  return (
    [...liveCapsules, ...retiredCapsules]
      .flatMap((capsule) => capsule.pool)
      .find((reward) => reward.name === baseName)?.rarity || "Common"
  );
}

function CapsulesTab({
  showRetired,
  setShowRetired,
  openCapsule,
  showOdds,
  openMass,
  playerTokens,
}: {
  showRetired: boolean;
  setShowRetired: (value: boolean) => void;
  openCapsule: (capsule: Capsule) => void;
  showOdds: (capsule: Capsule) => void;
  openMass: () => void;
  playerTokens: number;
}) {
  const capsules = showRetired
    ? [...liveCapsules, ...retiredCapsules]
    : liveCapsules;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#ffe2a0]">
            The drop room
          </p>
          <h1 className="mt-2 text-4xl font-black">Capsules</h1>
          <p className="mt-2 max-w-xl text-[#d7b88c]">
            Every capsule has its own pool and specific Blook chances.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={openMass}
            className="rounded-xl bg-[#e9bd67] px-4 py-3 text-sm font-black text-[#29170c]"
          >
            Mass open
          </button>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-[#3a2415] px-4 py-3 text-sm font-bold">
            <input
              type="checkbox"
              checked={showRetired}
              onChange={(event) => setShowRetired(event.target.checked)}
              className="h-4 w-4 accent-[#e9bd67]"
            />
            Show retired boxes
          </label>
        </div>
      </div>
      {showRetired && (
        <div className="mt-5 rounded-xl border border-[#d49a4a]/35 bg-[#6c4328]/35 px-4 py-3 text-sm text-[#ffe2a0]">
          Retired boxes are visual-only and can come back at any time.
        </div>
      )}
      <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {capsules.map((capsule) => (
          <div
            key={capsule.name}
            className={`group rounded-2xl p-6 transition hover:-translate-y-1 ${
              capsule.retired ? "bg-[#302016] opacity-80" : "border border-[#d49a4a]/25 bg-[#3a2415]"
            }`}
          >
            <div className="flex h-64 items-center justify-center">
              <img
                src={capsule.art}
                alt={capsule.name}
                className={`max-h-full max-w-full object-contain transition duration-300 group-hover:scale-105 ${
                  capsule.name === "BlookTuber Capsule" ? "rounded-3xl" : ""
                }`}
              />
            </div>
            <div className="mt-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-black">{capsule.name}</h2>
                <p className="mt-1 text-sm text-[#d7b88c]">
                  {capsule.pool.length} possible Blooks
                </p>
              </div>
              <button
                title="View Blook chances"
                onClick={() => showOdds(capsule)}
                className="rounded-full px-2 py-1 text-xs font-black text-[#ffe2a0]"
              >
                i
              </button>
            </div>
            {capsule.note && (
              <p className="mt-3 text-xs font-bold uppercase tracking-widest text-[#ffe2a0]">
                {capsule.note}
              </p>
            )}
            <button
              type="button"
              disabled={capsule.retired}
              onClick={() => openCapsule(capsule)}
              className="mt-5 w-full rounded-xl bg-[#e9bd67] px-4 py-3 font-black text-[#29170c] disabled:cursor-not-allowed disabled:bg-[#624833] disabled:text-[#a68a6e]"
            >
              {capsule.retired ? "Retired" : `Open for ${capsule.price}`}
            </button>
            {!capsule.retired && (
              <p className="mt-2 text-center text-xs text-[#9cc8e8]">
                {playerTokens >= capsule.price ? "Ready to open" : `Need ${capsule.price - playerTokens} more tokens`}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function RewardArt({ name, art, className }: { name: string; art: string; className: string }) {
  if (name === "Timeglass") {
    return <span className={`timeglass-sequence relative inline-flex h-full w-full items-center justify-center ${className}`}>{["/assets/Time glass first animation.svg", "/assets/Time glass second animation2.svg", "/assets/Time glass 3rd animation3.svg", "/assets/Time glass final animation.svg"].map((frame, index) => <img key={frame} src={frame} alt={name} className={`timeglass-frame timeglass-frame-${index} max-h-full max-w-full object-contain`} />)}</span>;
  }
  return (
    <span className={`relative inline-flex items-center justify-center ${className}`}>
      <img src={art} alt={name} className={`max-h-full max-w-full object-contain ${name === "Golden Shuriken" ? "shuriken-spin" : ""}`} />
      {name === "Caveman" && <img src="/assets/rock for caveman to throw.svg" alt="" className="caveman-accessory caveman-rock absolute bottom-0 right-0 h-1/3 w-1/3 object-contain" />}
      {name === "Alien" && <img src="/assets/lar blaster (for alien).svg" alt="" className="alien-accessory alien-laser absolute bottom-0 right-0 h-1/2 w-1/2 object-contain" />}
    </span>
  );
}

function InventoryTab({
  player,
  equip,
  sell,
}: {
  player: Player;
  equip: (name: string) => void;
  sell: (name: string) => void;
}) {
  const [selected, setSelected] = useState<Reward | null>(null);
  const owned = (name: string) =>
    player.inventory.filter((item) => item === name).length;
  const catalog = [...liveCapsules, ...retiredCapsules].map((capsule) => ({
    ...capsule,
    pool: [
      ...capsule.pool,
      ...capsule.pool
        .filter((reward) => shinyEligibleNames.has(reward.name))
        .map((reward) => ({ ...reward, name: `Shiny ${reward.name}` })),
    ],
  }));
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#ffe2a0]">
        Your collection
      </p>
      <h1 className="mt-2 text-4xl font-black">Blooks</h1>
      <p className="mt-2 text-[#d7b88c]">
        Small tiles keep the collection scannable. Click any Blook for its
        details.
      </p>
      <div className="mt-8 space-y-7">
          {catalog.map((capsule) => (
          <section key={capsule.name}>
            <div className="mb-3 flex items-center gap-3">
              <h2 className="font-black">{capsule.name}</h2>
              {capsule.retired && (
                <span className="rounded-full bg-[#624833] px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-[#d7b88c]">
                  Retired
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {capsule.pool.map((reward) => {
                const quantity = owned(reward.name);
                return (
                  <button
                    key={reward.name}
                    title={quantity ? `${reward.name}, quantity ${quantity}` : "Locked Blook"}
                    onClick={() => quantity && setSelected(reward)}
                    className={`relative flex h-28 w-28 flex-col items-center justify-center rounded-lg border-0 bg-transparent p-1 text-center transition hover:-translate-y-0.5 ${quantity ? "" : "opacity-70"}`}
                  >
                    {quantity ? <RewardArt name={reward.name} art={artFor(reward.name)} className={`h-20 w-20 ${rewardEffectClassFor(reward.name, reward.rarity)}`} /> : <span className="h-20 w-20 rounded-md bg-black" aria-hidden="true" />}
                    {!quantity && (
                      <Lock
                        size={13}
                        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white"
                      />
                    )}
                    {quantity > 1 && (
                      <span className="absolute bottom-1 right-1 rounded bg-[#e9bd67] px-1 text-[10px] font-black text-[#29170c]">
                        x{quantity}
                      </span>
                    )}
                    {quantity && <span className="mt-1 max-w-full truncate text-xs font-black text-[#f0d7ae]">{reward.name}</span>}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      {selected && (
        <BlookDetail
          reward={selected}
          quantity={owned(selected.name)}
          equipped={player.equipped === selected.name}
          onClose={() => setSelected(null)}
          equip={equip}
          sell={sell}
        />
      )}
    </div>
  );
}

function BlookDetail({
  reward,
  quantity,
  equipped,
  onClose,
  equip,
  sell,
}: {
  reward: Reward;
  quantity: number;
  equipped: boolean;
  onClose: () => void;
  equip: (name: string) => void;
  sell: (name: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-5 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-[#d49a4a]/30 bg-[#3a2415] p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[#ffe2a0]">
              Blook details
            </p>
            <h2 className="mt-2 text-2xl font-black">{reward.name}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1 text-sm"
          >
            Close
          </button>
        </div>
        <div className="mt-5 flex h-36 items-center justify-center rounded-xl bg-[#24170f]">
          <RewardArt name={reward.name} art={artFor(reward.name)} className={`h-full w-full ${rewardEffectClassFor(reward.name, reward.rarity)}`} />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Stat label="Rarity" value={reward.rarity} />
          <Stat label="Quantity" value={String(quantity)} />
          <Stat label="Shiny" value={shinyEligibleNames.has(reward.name.replace(/^Shiny /, "")) ? "Eligible · 1/100" : "Not eligible"} />
          <Stat
            label="Global owned"
            value="Not synced"
          />
          <Stat
            label="Sell value"
            value={`${sellValueFor(reward.rarity)} tokens`}
          />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            disabled={!quantity || equipped}
            onClick={() => {
              equip(reward.name);
              onClose();
            }}
            className="rounded-lg bg-[#e9bd67] px-3 py-2 text-xs font-black text-[#29170c] disabled:opacity-40"
          >
            {equipped ? "Equipped" : "Equip"}
          </button>
          <button
            disabled={quantity <= 1}
            onClick={() => {
              if (
                window.confirm(
                  `Sell ${reward.name} for ${sellValueFor(reward.rarity)} tokens?`,
                )
              ) {
                sell(reward.name);
                onClose();
              }
            }}
            className="rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-40"
          >
            Sell
          </button>
        </div>
      </div>
    </div>
  );
}

function MineTab({
  player,
  mine,
  buyUpgrade,
}: {
  player: Player;
  mine: () => void;
  buyUpgrade: (index: number) => void;
}) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#ffe2a0]">
        Earn your currency
      </p>
      <h1 className="mt-2 text-4xl font-black">The Mine</h1>
      <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-[#d49a4a]/25 bg-[#3a2415] p-6">
          <div className="mine-scene cave-scene relative flex h-72 items-center justify-center rounded-2xl bg-gradient-to-br from-[#6c4328] to-[#24170f]">
            <img src="/assets/mine scene.svg" alt="Cave mine" className="absolute inset-0 h-full w-full object-cover opacity-80" />
            <img
              src="/assets/worker.svg"
              alt="Mine worker"
              className="mine-worker max-h-56"
            />
            <img src="/assets/pickaxe.svg" alt="Pickaxe" className="mine-pickaxe absolute h-20 object-contain" />
          </div>
          <div className="mt-6 flex items-end justify-between">
            <div>
              <p className="text-sm text-[#d7b88c]">Daily earnings</p>
              <p className="mt-1 text-4xl font-black">
                {player.mined}{" "}
                <span className="text-lg text-[#b58d68]">/ {mineCapFor(player.pickaxe)}</span>
              </p>
            </div>
            <button
              onClick={mine}
              className="rounded-xl bg-[#e9bd67] px-5 py-3 font-black text-[#29170c]"
            >
              Mine 25
            </button>
          </div>
          <div className="mt-5 h-3 overflow-hidden rounded-full bg-[#24170f]">
            <div
              className="h-full rounded-full bg-[#e9bd67] transition-all"
              style={{ width: `${Math.min(100, player.mined / 25)}%` }}
            />
          </div>
        </div>
        <div className="rounded-3xl border border-[#d49a4a]/25 bg-[#3a2415] p-6">
          <h2 className="text-xl font-black">Pickaxe upgrades</h2>
          <p className="mt-2 text-sm text-[#d7b88c]">
            Buy the next tool to show it in your mine.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {upgrades.map((upgrade, index) => (
              <button
                key={upgrade.name}
                onClick={() => buyUpgrade(index)}
                disabled={index <= player.pickaxe}
                className={`rounded-xl p-3 text-center ${index === player.pickaxe ? "border border-[#e9bd67] bg-[#6c4328]" : "bg-[#24170f]"} disabled:cursor-default`}
              >
                <img
                  src={upgrade.art}
                  alt={upgrade.name}
                  className="mx-auto h-20 object-contain"
                />
                <p className="mt-2 text-xs font-bold">{upgrade.name}</p>
                <p className="mt-1 text-xs text-[#ffe2a0]">
                  {index === player.pickaxe
                    ? "Equipped"
                    : upgrade.cost + " tokens"}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Bazaar({
  player,
  createListing,
  openListing,
}: {
  player: Player;
  createListing: (blook: string, price: number) => void;
  openListing: (listing: Listing) => void;
}) {
  const [blook, setBlook] = useState(player.inventory[0]);
  const [price, setPrice] = useState("10");
  const [search, setSearch] = useState("");
  const [rarity, setRarity] = useState("All rarities");
  const [showForm, setShowForm] = useState(false);
  const [view, setView] = useState<"browse" | "mine">("browse");
  const ownedBlooks = player.inventory.filter(
    (name, index, items) => items.indexOf(name) === index,
  );
  const listings = player.listings.filter((listing) => {
    const matchesSearch = listing.blook.toLowerCase().includes(search.toLowerCase());
    const matchesRarity = rarity === "All rarities" || rarityFor(listing.blook) === rarity;
    const matchesView = view === "browse" || listing.seller === player.username;
    return matchesSearch && matchesRarity && matchesView;
  });
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.3em] text-[#ffe2a0]">Player marketplace</p><h1 className="mt-2 text-4xl font-black">Bazaar</h1></div>
        <button onClick={() => setShowForm(!showForm)} className="rounded-xl bg-[#e9bd67] px-5 py-3 font-black text-[#29170c]">+ List an item</button>
      </div>
      <div className="mt-6 flex rounded-2xl border border-[#d49a4a]/25 bg-[#3a2415] p-1">
        <button onClick={() => setView("browse")} className={`flex-1 rounded-xl px-4 py-3 font-black ${view === "browse" ? "bg-[#f0e2d2] text-[#29170c]" : "text-[#d7b88c]"}`}>Browse</button>
        <button onClick={() => setView("mine")} className={`flex-1 rounded-xl px-4 py-3 font-bold ${view === "mine" ? "bg-[#e9bd67] text-[#29170c]" : "text-[#d7b88c]"}`}>My listings</button>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search Blooks" className="min-w-[220px] flex-1 rounded-xl bg-[#3a2415] px-4 py-3 text-white" />
        <select value={rarity} onChange={(event) => setRarity(event.target.value)} className="rounded-xl bg-[#3a2415] px-4 py-3 text-white">
          <option>All rarities</option>
          {[
            "Common",
            "Uncommon",
            "Rare",
            "Epic",
            "Legendary",
            "Mythic",
            "Unique",
            "Transcendent",
          ].map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select className="rounded-xl bg-[#3a2415] px-4 py-3 text-white">
          <option>Newest</option>
          <option>Lowest price</option>
          <option>Highest price</option>
        </select>
      </div>
      {showForm && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            createListing(blook, Number(price));
            setShowForm(false);
          }}
          className="mt-5 grid gap-3 rounded-2xl border border-[#d49a4a]/25 bg-[#3a2415] p-5 md:grid-cols-[1fr_180px_auto]"
        >
          <select
            value={blook}
            onChange={(event) => setBlook(event.target.value)}
            className="rounded-xl bg-[#24170f] px-3 py-3 text-white"
          >
            {ownedBlooks.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
          <input
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            type="number"
            min="1"
            max="100000"
            className="rounded-xl bg-[#24170f] px-3 py-3 text-white"
            placeholder="Price"
          />
          <button className="rounded-xl bg-[#e9bd67] px-4 py-3 font-black text-[#29170c]">
            List Blook
          </button>
        </form>
      )}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {listings.length ? listings.map((listing) => (
          <button key={listing.id} onClick={() => openListing(listing)} className="rounded-2xl border border-[#d49a4a]/25 bg-[#3a2415] p-4 text-left transition hover:-translate-y-1">
            <div className="flex h-40 items-center justify-center rounded-xl bg-[#24170f] p-3">
              <img src={artFor(listing.blook)} alt={listing.blook} className="max-h-full max-w-full rounded-2xl object-contain" />
            </div>
            <h2 className="mt-3 font-black">{listing.blook}</h2>
            <p className="mt-1 text-xs font-bold text-[#e9bd67]">{rarityFor(listing.blook)}</p>
            <p className="mt-3 font-black text-[#ffe2a0]">{listing.price} tokens</p>
            <p className="mt-1 text-xs text-[#b58d68]">Seller: {listing.seller}</p>
          </button>
        )) : <p className="col-span-full rounded-2xl border border-[#d49a4a]/25 bg-[#3a2415] p-8 text-center text-[#d7b88c]">No listings match your search yet.</p>}
      </div>
    </div>
  );
}

function RevealModal({
  reveal,
  close,
}: {
  reveal: {
    capsule: Capsule;
    reward: Reward;
    phase: "wiggle" | "dark" | "result";
  };
  close: () => void;
}) {
  return (
    <div className="modal-layer fixed inset-0 z-[9999] flex min-h-screen items-center justify-center bg-black/80 px-5 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl border border-[#d49a4a]/30 bg-[#3a2415] p-7 text-center shadow-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#ffe2a0]">
          {reveal.phase === "result" ? "New collectible" : "Opening capsule"}
        </p>
        {reveal.phase !== "result" && (
          <div
            className={`mx-auto mt-7 flex h-72 items-center justify-center ${reveal.phase === "wiggle" ? "capsule-wiggle" : "capsule-dark"}`}
          >
            <img
              src={reveal.capsule.art}
              alt={reveal.capsule.name}
              className="max-h-full max-w-full object-contain"
            />
          </div>
        )}
        {reveal.phase === "result" && (
          <>
            <div className="mx-auto mt-7 flex h-56 items-center justify-center rounded-2xl bg-[#24170f] p-5">
              <RewardArt name={reveal.reward.name} art={reveal.reward.art || artFor(reveal.reward.name)} className={`h-full w-full ${rewardEffectClassFor(reveal.reward.name, reveal.reward.rarity)}`} />
            </div>
            <h1 className="mt-5 text-3xl font-black">{reveal.reward.name}</h1>
            <p className="mt-2 text-lg font-bold text-[#ffe2a0]">
              {reveal.reward.rarity}
            </p>
            <button
              onClick={close}
              className="mt-7 w-full rounded-xl bg-[#e9bd67] px-4 py-3 font-black text-[#29170c]"
            >
              Add to collection
            </button>
          </>
        )}
      </div>
    </div>
  );
}
function ListingModal({ listing, close, buy }: { listing: Listing; close: () => void; buy: (listing: Listing) => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-5 backdrop-blur-sm"><div className="w-full max-w-sm rounded-2xl border border-[#d49a4a]/30 bg-[#3a2415] p-6 text-center"><p className="text-xs font-bold uppercase tracking-widest text-[#ffe2a0]">Bazaar listing</p><div className="mt-5 flex h-40 items-center justify-center rounded-xl bg-[#24170f]"><img src={artFor(listing.blook)} alt={listing.blook} className="max-h-full max-w-full object-contain" /></div><h2 className="mt-4 text-2xl font-black">{listing.blook}</h2><p className="mt-2 text-sm text-[#d7b88c]">{rarityFor(listing.blook)} · Seller: {listing.seller}</p><p className="mt-4 text-xl font-black text-[#ffe2a0]">{listing.price} tokens</p><div className="mt-6 grid grid-cols-2 gap-2"><button onClick={close} className="rounded-xl px-3 py-3 text-sm font-bold">Close</button><button onClick={() => buy(listing)} className="rounded-xl bg-[#e9bd67] px-3 py-3 text-sm font-black text-[#29170c]">Buy Blook</button></div></div></div>;
}
function OddsModal({
  capsule,
  close,
}: {
  capsule: Capsule;
  close: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-5 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-[#d49a4a]/30 bg-[#3a2415] p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[#ffe2a0]">
              Specific Blook chances
            </p>
            <h2 className="mt-2 text-2xl font-black">{capsule.name}</h2>
          </div>
          <button
            onClick={close}
            className="rounded-lg px-3 py-1 text-sm text-[#f0d7ae]"
          >
            Close
          </button>
        </div>
        <div className="mt-6 space-y-2">
          {capsule.pool.map((reward) => (
            <div
              key={reward.name}
              className="flex items-center justify-between rounded-lg bg-[#24170f] px-3 py-2 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2">
                <RewardArt name={reward.name} art={reward.art || artFor(reward.name)} className={`h-9 w-9 shrink-0 ${rewardEffectClassFor(reward.name, reward.rarity)}`} />
                <span className="truncate">{reward.name} <b className="ml-1 text-xs text-[#eac477]">{reward.rarity}</b></span>
              </span>
              <b className="text-[#ffe2a0]">
                {chanceFor(capsule, reward).toFixed(2)}%
              </b>
            </div>
          ))}
        </div>
        <p className="mt-5 text-xs leading-5 text-[#b58d68]">
          Legendary is 0.50% total per pack and Mythic is 0.20% total per pack.
          Opening a capsule only grants its Blook reward; it never creates
          tokens.
        </p>
      </div>
    </div>
  );
}
function MassOpenModal({
  quantities,
  setQuantity,
  close,
  open,
}: {
  quantities: Record<string, number>;
  setQuantity: (name: string, quantity: number) => void;
  close: () => void;
  open: (quantities: Record<string, number>) => void;
}) {
  const total = liveCapsules.reduce(
    (sum, capsule) => sum + (quantities[capsule.name] || 0) * capsule.price,
    0,
  );
  const count = liveCapsules.reduce(
    (sum, capsule) => sum + (quantities[capsule.name] || 0),
    0,
  );
  return (
    <div className="modal-layer fixed inset-0 z-[9999] flex min-h-screen items-center justify-center bg-black/70 px-5 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl border border-[#d49a4a]/30 bg-[#3a2415] p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[#ffe2a0]">Batch opening</p>
            <h2 className="mt-2 text-2xl font-black">Mass open capsules</h2>
          </div>
          <button onClick={close} className="rounded-lg px-3 py-1 text-sm text-[#f0d7ae]">Close</button>
        </div>
        <div className="mt-6 space-y-3">
          {liveCapsules.map((capsule) => (
            <div key={capsule.name} className="flex items-center gap-3 rounded-xl bg-[#24170f] p-3">
              <img src={capsule.art} alt={capsule.name} className="h-12 w-12 object-contain" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-black">{capsule.name}</p>
                <p className="text-xs text-[#b58d68]">{capsule.price} tokens each</p>
              </div>
              <button onClick={() => setQuantity(capsule.name, Math.max(0, (quantities[capsule.name] || 0) - 1))} className="h-9 w-9 rounded-lg text-lg font-black">-</button>
              <input
                type="number"
                min="0"
                max="999"
                value={quantities[capsule.name] || 0}
                onChange={(event) => {
                  const value = Number.parseInt(event.target.value, 10);
                  setQuantity(capsule.name, Number.isFinite(value) ? Math.min(999, Math.max(0, value)) : 0);
                }}
                className="h-9 w-14 rounded-lg bg-[#3a2415] text-center font-black text-white"
                aria-label={`${capsule.name} quantity`}
              />
              <button onClick={() => setQuantity(capsule.name, (quantities[capsule.name] || 0) + 1)} className="h-9 w-9 rounded-lg text-lg font-black">+</button>
            </div>
          ))}
        </div>
        <div className="mt-6 flex items-center justify-between pt-4 text-sm">
          <span>{count} capsule{count === 1 ? "" : "s"}</span>
          <b className="text-lg text-[#ffe2a0]">{total} tokens</b>
        </div>
        <button onClick={() => open(quantities)} className="mt-4 w-full rounded-xl bg-[#e9bd67] px-4 py-3 font-black text-[#29170c]">Open selected capsules</button>
      </div>
    </div>
  );
}
function MassResultsModal({
  results,
  close,
}: {
  results: { capsule: string; reward: Reward }[];
  close: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-5 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl border border-[#d49a4a]/30 bg-[#3a2415] p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-[#ffe2a0]">Opening complete</p>
        <h2 className="mt-2 text-2xl font-black">Your Blooks</h2>
        <div className="mt-5 grid max-h-96 gap-2 overflow-y-auto sm:grid-cols-2">
          {results.map((result, index) => (
            <div key={`${result.capsule}-${result.reward.name}-${index}`} className="flex items-center gap-3 rounded-xl bg-[#24170f] p-3">
              <img src={result.reward.art} alt={result.reward.name} className="h-14 w-14 object-contain" />
              <div className="min-w-0"><p className="truncate font-black">{result.reward.name}</p><p className="text-xs text-[#b58d68]">{result.reward.rarity}</p></div>
            </div>
          ))}
        </div>
        <button onClick={close} className="mt-6 w-full rounded-xl bg-[#e9bd67] px-4 py-3 font-black text-[#29170c]">Add to collection</button>
      </div>
    </div>
  );
}
function DismantleConfirmModal({
  name,
  bundle,
  confirm,
  close,
}: {
  name: string;
  bundle: MaterialBundle;
  confirm: () => void;
  close: () => void;
}) {
  return (
    <div className="modal-layer fixed inset-0 z-[9999] flex min-h-screen items-center justify-center bg-black/70 px-5 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl border border-[#247bc0] bg-[#0b2b52] p-6 text-center shadow-2xl">
        <p className="text-xs font-bold uppercase tracking-widest text-[#bde8ff]">Recycle Blook</p>
        <img src={artFor(name)} alt={name} className="mx-auto mt-4 h-28 w-28 object-contain" />
        <h2 className="mt-3 text-2xl font-black">Dismantle {name}?</h2>
        <p className="mt-2 text-sm text-[#9cc8e8]">This removes one copy and returns:</p>
        <div className="mt-4 flex justify-center gap-3">
          {bundleEntries(bundle).map(([material, amount]) => (
            <div key={material} className="rounded-xl bg-[#071a33] p-2">
              <img src={materialArtFor(material)} alt={material} className="h-12 w-12 object-contain" />
              <b className="text-[#bde8ff]">x{amount}</b>
            </div>
          ))}
        </div>
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button onClick={close} className="rounded-xl border border-[#24649c] px-3 py-3 font-bold text-[#bde8ff]">Cancel</button>
          <button onClick={confirm} className="rounded-xl bg-[#39a8f5] px-3 py-3 font-black text-[#031426]">Dismantle</button>
        </div>
      </div>
    </div>
  );
}
function CraftingMachineModal({
  name,
  ingredients,
  phase,
  close,
}: {
  name: string;
  ingredients: MaterialBundle;
  phase: "processing" | "output";
  close: () => void;
}) {
  return (
    <div className="modal-layer fixed inset-0 z-[9999] flex min-h-screen items-center justify-center bg-[#031426]/85 px-5 backdrop-blur-sm">
      <div className="craft-machine-modal w-full max-w-xl rounded-3xl border border-[#5dbdff] bg-[#bfe8ff] p-6 text-center text-[#062443] shadow-2xl">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-[#17659c]">Workshop machine</p>
        <h2 className="mt-2 text-3xl font-black">{phase === "processing" ? "Forging your Blook" : "Craft complete"}</h2>
          <div className="mt-6 rounded-2xl border-4 border-[#17659c] bg-[#e8f8ff] p-5">
            <img src="/assets/crafting machine.svg" alt="Crafting machine" className="mx-auto mb-4 h-28 w-full object-contain" />
          <div className="flex min-h-44 items-center justify-center gap-2 overflow-hidden rounded-xl bg-[#8ed2f7] p-4">
            {phase === "processing" ? (
              <div className="craft-material-stream flex items-center gap-2">
                {bundleEntries(ingredients).map(([material, amount]) => <span key={material} className="craft-input flex items-center rounded-xl bg-white/80 p-2"><img src={materialArtFor(material)} alt={material} className="h-12 w-12 object-contain" /><b className="text-sm">x{amount}</b></span>)}
              </div>
            ) : (
              <div className="craft-output-pop rounded-2xl bg-white/75 p-5"><img src={artFor(name)} alt={name} className="mx-auto h-36 w-36 object-contain" /></div>
            )}
          </div>
          <div className="mx-auto mt-4 flex max-w-sm items-center gap-2"><span className="h-3 flex-1 rounded-full bg-[#17659c]" /><span className="h-10 w-20 rounded-lg border-4 border-[#17659c] bg-[#5dbdff]" /><span className="h-3 flex-1 rounded-full bg-[#17659c]" /></div>
        </div>
        {phase === "output" && <button onClick={close} className="mt-6 w-full rounded-xl bg-[#17659c] px-4 py-3 font-black text-white">Collect {name}</button>}
      </div>
    </div>
  );
}
function Leaderboard({ player }: { player: Player }) {
  const [view, setView] = useState<"blooks" | "tokens" | "clans">("blooks");
  const podium = [["BreadMaster", 1875, "Bread Blook"], ["ToastLord", 1420, "Red Rex"], [player.username, player.mined, player.equipped]].sort((a, b) => Number(b[1]) - Number(a[1]));
  return (
    <div>
      <h1 className="text-4xl font-black">Leaderboard</h1>
      <div className="mt-6 flex gap-2 rounded-2xl border border-[#247bc0] bg-[#18558f] p-1">{[["blooks", "Blook score"], ["tokens", "Tokens"], ["clans", "Clans"]].map(([key, label]) => <button key={key} onClick={() => setView(key as typeof view)} className={`flex-1 rounded-xl px-3 py-3 font-black ${view === key ? "bg-[#bde8ff] text-[#062443]" : "text-[#d9f3ff]"}`}>{label}</button>)}</div>
      {view === "blooks" && <p className="mt-3 text-sm text-[#9cc8e8]">Blook score rewards rarity and collection depth.</p>}
      {view === "clans" && <p className="mt-3 text-sm text-[#9cc8e8]">Clan rankings will use member contributions and unlocked benefits.</p>}
      <div className="mt-8 grid items-end gap-4 md:grid-cols-3">
        {[podium[1], podium[0], podium[2]].map((row, index) => <div key={String(row[0])} className={`rounded-2xl border border-[#73c8ff]/45 bg-[#18558f] p-5 text-center ${index === 1 ? "md:-translate-y-5" : ""}`}><p className="text-3xl font-black text-[#bde8ff]">{index === 1 ? "1" : index === 0 ? "2" : "3"}</p><img src={artFor(String(row[2]))} alt={String(row[2])} className="mx-auto mt-3 h-24 w-24 object-contain" /><h2 className="mt-3 font-black">{row[0]}</h2><p className="text-sm text-[#d9f3ff]">Equipped: {row[2]}</p><p className="mt-2 font-black text-[#bde8ff]">{row[1]} mined</p></div>)}
      </div>
      <div className="mt-8 max-w-2xl overflow-hidden rounded-2xl border border-[#d49a4a]/25 bg-[#3a2415]">
        <div className="grid grid-cols-[1fr_auto] px-5 py-4 text-xs font-bold uppercase tracking-widest text-[#b58d68]">
          <span>Player</span>
          <span>Tokens mined</span>
        </div>
        {[
          [player.username, player.mined],
          ["BreadMaster", 1875],
          ["ToastLord", 1420],
        ]
          .sort((a, b) => Number(b[1]) - Number(a[1]))
          .map((row, index) => (
            <div
              key={String(row[0])}
              className="grid grid-cols-[1fr_auto] px-5 py-4 text-sm"
            >
              <span>
                <b className="mr-3 text-[#ffe2a0]">#{index + 1}</b>
                {row[0]}
              </span>
              <span className="font-bold text-[#f0d7ae]">{row[1]}</span>
            </div>
          ))}
      </div>
    </div>
  );
}
function SimplePanel({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action: string;
}) {
  return (
    <div className="rounded-3xl border border-[#d49a4a]/25 bg-[#3a2415] p-8">
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#ffe2a0]">
        Breadlet social
      </p>
      <h1 className="mt-2 text-4xl font-black">{title}</h1>
      <p className="mt-4 max-w-xl leading-7 text-[#d7b88c]">{body}</p>
      <button className="mt-7 rounded-xl bg-[#e9bd67] px-5 py-3 font-black text-[#29170c]">
        {action}
      </button>
    </div>
  );
}

function ChatTab({ player, showBadge, giftNotice }: { player: Player; showBadge: (badge: string) => void; giftNotice: string }) {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<{ user: string; text: string; badges?: string[] }[]>([
    { user: player.username, badges: player.badges, text: "Welcome to Breadlet chat." },
  ]);
  const supabase = useMemo(() => createSupabaseClient(), []);
  useEffect(() => {
    let active = true;
    fetch("/api/chat").then((response) => response.ok ? response.json() : []).then((rows) => {
      if (active && Array.isArray(rows)) setMessages(rows.map((row: any) => ({ user: row.profiles?.username || "Player", text: row.message })));
    });
    if (!supabase) return () => { active = false; };
    const channel = supabase.channel("global-chat").on("postgres_changes", { event: "INSERT", schema: "public", table: "global_chat_messages" }, (payload) => {
      setMessages((current) => [...current, { user: payload.new.profile_id === undefined ? "Player" : player.username, text: payload.new.message }]);
    }).subscribe();
    return () => { active = false; supabase.removeChannel(channel); };
  }, [player.username, supabase]);
  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = message.trim();
    if (!text) return;
    if (supabase) {
      await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text }) });
    } else {
      setMessages((current) => [...current, { user: player.username, badges: player.badges, text }]);
    }
    setMessage("");
  };
  return <div className="max-w-3xl rounded-3xl border border-[#d49a4a]/25 bg-[#3a2415] p-6"><p className="text-xs font-bold uppercase tracking-[0.3em] text-[#ffe2a0]">{supabase ? "Supabase realtime" : "Prototype local chat"}</p><h1 className="mt-2 text-4xl font-black">Global Chat</h1>{giftNotice && <div className="mt-4 rounded-xl border border-[#73c8ff] bg-[#18558f] px-4 py-3 font-black text-[#bde8ff]">Gift notification: {giftNotice}</div>}<div className="mt-6 min-h-72 space-y-3 rounded-2xl bg-[#24170f] p-4">{messages.map((item, index) => <div key={`${item.user}-${index}`} className="flex gap-3"><img src={artFor(item.user === player.username ? player.equipped : "Bread Blook")} alt="" className="h-10 w-10 rounded-lg object-contain" /><div><div className="flex items-center gap-2 font-black">{item.user}{(item.user === player.username ? player.badges : item.badges || []).map((badge) => <button key={badge} onClick={() => showBadge(badge)} title={badge} className="h-5 w-5"><img src={badge === "First 50" ? "/assets/first-50-badge.svg" : badge === "Verified" ? "/assets/verified-badge.svg" : "/assets/blooktuber-badge.svg"} alt={badge} className="h-5 w-5 object-contain" /></button>)}</div><p className="text-sm text-[#d7b88c]">{item.text}</p></div></div>)}</div><form onSubmit={send} className="mt-4 flex gap-3"><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Write a message..." className="min-w-0 flex-1 rounded-xl bg-[#24170f] px-4 py-3 text-white" /><button type="submit" className="rounded-xl bg-[#e9bd67] px-5 py-3 font-black text-[#29170c]">Send</button></form></div>;
}

function BadgeModal({ badge, close }: { badge: string; close: () => void }) { return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-5 backdrop-blur-sm"><div className="w-full max-w-sm rounded-2xl border border-[#d49a4a]/30 bg-[#3a2415] p-6 text-center"><img src={badge === "First 50" ? "/assets/first-50-badge.svg" : badge === "Verified" ? "/assets/verified-badge.svg" : "/assets/blooktuber-badge.svg"} alt={badge} className="mx-auto h-24 w-24 object-contain" /><h2 className="mt-4 text-2xl font-black">{badge}</h2><p className="mt-3 text-sm leading-6 text-[#d7b88c]">{badgeDescriptions[badge]}</p><button onClick={close} className="mt-6 w-full rounded-xl bg-[#e9bd67] px-4 py-3 font-black text-[#29170c]">Close</button></div></div>; }
function PromoTab({
  code,
  setCode,
  redeem,
}: {
  code: string;
  setCode: (value: string) => void;
  redeem: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="max-w-xl rounded-3xl border border-[#d49a4a]/25 bg-[#3a2415] p-8">
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#ffe2a0]">
        Rewards
      </p>
      <h1 className="mt-2 text-4xl font-black">Promo Codes</h1>
      <p className="mt-4 leading-7 text-[#d7b88c]">
        Enter an active Breadlet code to claim its reward.
      </p>
      <form onSubmit={redeem} className="mt-7 flex flex-col gap-3 sm:flex-row">
        <input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="Enter promo code"
          className="min-w-0 flex-1 rounded-xl bg-[#24170f] px-4 py-3 text-white outline-none focus:border-[#eac477]"
        />
        <button className="rounded-xl bg-[#e9bd67] px-5 py-3 font-black text-[#29170c]">
          Redeem
        </button>
      </form>
      <p className="mt-4 text-xs text-[#b58d68]">
        Prototype code available: Breadlet2.0
      </p>
    </div>
  );
}
function InfoTab() {
  return (
    <div className="max-w-4xl space-y-6">
      <div className="rounded-3xl border border-[#73c8ff]/45 bg-[#bde8ff] p-7 text-[#062443]">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-[#17659c]">Breadlet guide</p>
        <h1 className="mt-2 text-4xl font-black">How to play</h1>
        <p className="mt-3 max-w-2xl leading-7">Build your collection, earn tokens, trade Blooks, and turn materials into special craft-only Blooks.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          ["Mine", "Mine up to 2,500 tokens each day. Upgrade your pickaxe to change the mine display."],
          ["Capsules", "Buy capsules with tokens. Open a capsule to roll from its listed Blook pool, or use Mass Open for typed quantities."],
          ["Collection", "Locked Blooks stay black silhouettes. Owned Blooks can be equipped or sold from their detail view."],
          ["Crafting", "Dismantle extra Blooks into five-unit material bundles, then combine ingredients totaling 20 to craft approved Blooks."],
          ["Bazaar", "List Blooks, browse listings, and open a listing card to buy it. This prototype marketplace is local."],
          ["Chat, Clans, Promo", "Chat is local, clan tags appear on profiles, and promo codes can grant prototype rewards."],
        ].map(([title, body]) => <section key={title} className="rounded-2xl border border-[#247bc0] bg-[#18558f] p-5"><h2 className="text-xl font-black text-[#bde8ff]">{title}</h2><p className="mt-2 text-sm leading-6 text-[#d9f3ff]">{body}</p></section>)}
      </div>
    </div>
  );
}
function AdminTab({
  player,
  grantTokens,
  grantBlook,
  grantBadge,
  announcement,
  setAnnouncement,
  publishAnnouncement,
  grantGift,
}: {
  player: Player;
  grantTokens: (amount: number) => void;
  grantBlook: (name: string) => void;
  grantBadge: (name: string) => void;
  announcement: string;
  setAnnouncement: (value: string) => void;
  publishAnnouncement: () => void;
  grantGift: (gift: { title: string; message: string; tokens: number; materials: Record<string, number>; badges: string[]; blooks: string[] }) => void;
}) {
  const [tokenAmount, setTokenAmount] = useState("100");
  const [banTarget, setBanTarget] = useState("");
  const [banReason, setBanReason] = useState("");
  const [banDuration, setBanDuration] = useState("24");
  const [giftTitle, setGiftTitle] = useState("");
  const [giftMessage, setGiftMessage] = useState("");
  const [giftBlook, setGiftBlook] = useState("");
  const [giftBadge, setGiftBadge] = useState("");
  const [giftMaterial, setGiftMaterial] = useState("Flour");
  const [giftMaterialAmount, setGiftMaterialAmount] = useState("0");
  const [banRecord, setBanRecord] = useState<{ target: string; reason: string; duration: string } | null>(null);
  const [appeal, setAppeal] = useState("");
  return (
    <div className="max-w-5xl space-y-6">
      <div className="rounded-3xl border border-[#73c8ff]/50 bg-[#18558f] p-8">
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-red-200">
        Local prototype only
      </p>
      <h1 className="mt-2 text-4xl font-black">Admin Panel</h1>
      <p className="mt-4 leading-7 text-[#d7b88c]">
        Grant resources to {player.username}. This panel is browser-local and is
        not secure for production until server-side authorization is connected.
      </p>
      </div>
      <div className="mt-7 rounded-2xl border border-[#3d91cd] bg-[#103f75] p-5">
        <h2 className="text-xl font-black text-[#bde8ff]">Exact token grant</h2>
        <div className="mt-3 flex gap-3"><input value={tokenAmount} onChange={(event) => setTokenAmount(event.target.value)} type="number" min="0" className="w-40 rounded-xl border border-[#3d91cd] bg-[#0c3b70] px-3 py-3 text-white" /><button onClick={() => grantTokens(Number(tokenAmount) || 0)} className="rounded-xl bg-[#39a8f5] px-4 py-3 font-black text-[#031426]">Grant tokens</button></div>
      </div>
      <div className="rounded-2xl border border-[#3d91cd] bg-[#103f75] p-5"><h2 className="text-xl font-black text-[#bde8ff]">Global announcement</h2><div className="mt-3 flex gap-3"><input value={announcement} onChange={(event) => setAnnouncement(event.target.value)} placeholder="Message to all players" className="min-w-0 flex-1 rounded-xl border border-[#3d91cd] bg-[#0c3b70] px-3 py-3 text-white" /><button onClick={publishAnnouncement} className="rounded-xl bg-[#39a8f5] px-4 py-3 font-black text-[#031426]">Publish</button></div></div>
      <div className="rounded-2xl border border-[#ef8b9d]/40 bg-[#421f45] p-5"><h2 className="text-xl font-black text-[#ffd6df]">Moderation</h2><p className="mt-2 text-sm text-[#f2b9c7]">Local prototype moderation record. Server-backed bans require account storage.</p><div className="mt-3 grid gap-3 sm:grid-cols-3"><input value={banTarget} onChange={(event) => setBanTarget(event.target.value)} placeholder="Player username" className="rounded-xl border border-[#b85a77] bg-[#351c3a] px-3 py-3 text-white" /><input value={banDuration} onChange={(event) => setBanDuration(event.target.value)} type="number" min="1" placeholder="Hours" className="rounded-xl border border-[#b85a77] bg-[#351c3a] px-3 py-3 text-white" /><input value={banReason} onChange={(event) => setBanReason(event.target.value)} placeholder="Reason" className="rounded-xl border border-[#b85a77] bg-[#351c3a] px-3 py-3 text-white" /></div><button onClick={() => { if (banTarget.trim()) setBanRecord({ target: banTarget.trim(), reason: banReason.trim() || "No reason provided", duration: banDuration }); }} className="mt-3 rounded-xl bg-[#ef8b9d] px-4 py-3 font-black text-[#351c3a]">Ban player</button>{banRecord && <div className="mt-4 rounded-xl border border-[#ef8b9d]/50 bg-[#351c3a] p-4"><p className="font-black text-[#ffd6df]">{banRecord.target} is banned</p><p className="mt-1 text-sm text-[#f2b9c7]">{banRecord.duration} hours · {banRecord.reason}</p><textarea value={appeal} onChange={(event) => setAppeal(event.target.value)} placeholder="Appeal reason" className="mt-3 min-h-20 w-full rounded-xl border border-[#b85a77] bg-[#2b1830] px-3 py-2 text-white" /><button onClick={() => setAppeal("")} className="mt-2 rounded-xl border border-[#ef8b9d] px-3 py-2 text-sm font-bold text-[#ffd6df]">Submit appeal</button></div>}</div>
      <div className="rounded-2xl border border-[#3d91cd] bg-[#103f75] p-5"><h2 className="text-xl font-black text-[#bde8ff]">Admin gift composer</h2><div className="mt-3 grid gap-3 sm:grid-cols-2"><input value={giftTitle} onChange={(event) => setGiftTitle(event.target.value)} placeholder="Gift title" className="rounded-xl border border-[#3d91cd] bg-[#0c3b70] px-3 py-3 text-white" /><input value={giftMessage} onChange={(event) => setGiftMessage(event.target.value)} placeholder="Gift message" className="rounded-xl border border-[#3d91cd] bg-[#0c3b70] px-3 py-3 text-white" /></div><div className="mt-3 grid gap-3 sm:grid-cols-4"><input value={giftBlook} onChange={(event) => setGiftBlook(event.target.value)} placeholder="Blook name" className="rounded-xl border border-[#3d91cd] bg-[#0c3b70] px-3 py-3 text-white" /><input value={giftBadge} onChange={(event) => setGiftBadge(event.target.value)} placeholder="Badge name" className="rounded-xl border border-[#3d91cd] bg-[#0c3b70] px-3 py-3 text-white" /><select value={giftMaterial} onChange={(event) => setGiftMaterial(event.target.value)} className="rounded-xl border border-[#3d91cd] bg-[#0c3b70] px-3 py-3 text-white">{materialNames.map((material) => <option key={material}>{material}</option>)}</select><input value={giftMaterialAmount} onChange={(event) => setGiftMaterialAmount(event.target.value)} type="number" min="0" placeholder="Material qty" className="rounded-xl border border-[#3d91cd] bg-[#0c3b70] px-3 py-3 text-white" /></div><button onClick={() => grantGift({ title: giftTitle, message: giftMessage, tokens: Number(tokenAmount) || 0, blooks: giftBlook ? [giftBlook] : [], badges: giftBadge ? [giftBadge] : [], materials: { [giftMaterial]: Number(giftMaterialAmount) || 0 } })} className="mt-4 rounded-xl bg-[#39a8f5] px-4 py-3 font-black text-[#031426]">Send gift to current local profile</button></div>
      <div className="rounded-2xl border border-[#3d91cd] bg-[#103f75] p-5">
        <h2 className="text-xl font-black text-[#bde8ff]">Quick grants</h2>
      <div className="mt-7 grid gap-3 sm:grid-cols-3">
        <button
          onClick={() => grantTokens(100)}
          className="rounded-xl bg-[#e9bd67] px-4 py-3 font-black text-[#29170c]"
        >
          +100 tokens
        </button>
        <button
          onClick={() => grantTokens(1000)}
          className="rounded-xl bg-[#e9bd67] px-4 py-3 font-black text-[#29170c]"
        >
          +1,000 tokens
        </button>
        <button
          onClick={() => grantTokens(10000)}
          className="rounded-xl bg-[#e9bd67] px-4 py-3 font-black text-[#29170c]"
        >
          +10,000 tokens
        </button>
      </div>
      <h2 className="mt-8 text-xl font-black">Grant Blook</h2>
      <div className="mt-4 flex flex-wrap gap-3">
        {[
          "Bread Blook",
          "Red Rex",
          "Golden Shuriken",
          "Mr. Receipt",
          "Alien",
          "Golden UFO",
        ].map((name) => (
          <button
            key={name}
            onClick={() => grantBlook(name)}
            className="rounded-xl bg-[#24170f] px-4 py-3 text-sm font-bold text-[#ffe2a0]"
          >
            {name}
          </button>
        ))}
      </div>
      <h2 className="mt-8 text-xl font-black">Grant Badge</h2>
      <div className="mt-4 flex flex-wrap gap-3">
        {['First 50', 'Verified', 'BlookTuber'].map((badge) => (
          <button key={badge} onClick={() => grantBadge(badge)} className="rounded-xl bg-[#24170f] px-4 py-3 text-sm font-bold text-[#ffe2a0]">
            {badge}
          </button>
        ))}
      </div>
      </div>
    </div>
  );
}
function ClanTab({
  player,
  setClan,
  savePlayer,
}: {
  player: Player;
  setClan: (tag: string) => void;
  savePlayer: (player: Player) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [clan, setClanState] = useState<{ name: string; description: string; tags: string[]; members: number; treasury: number } | null>(null);
  const [filter, setFilter] = useState("");
  const clans = [
    { name: "Token Grinders", description: "Daily mine runs and token goals.", tags: ["grinders", "active"], members: 18, treasury: 42000 },
    { name: "Crumb Collectors", description: "For collectors chasing rare drops.", tags: ["collectors", "trading"], members: 12, treasury: 28500 },
    { name: "Fresh Loaves", description: "New-player friendly and helpful.", tags: ["new-player", "friendly"], members: 21, treasury: 16000 },
  ].filter((item) => !filter || item.tags.some((tag) => tag.includes(filter.toLowerCase())) || item.name.toLowerCase().includes(filter.toLowerCase()));
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-[#73c8ff]/45 bg-[#18558f] p-6">
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#ffe2a0]">
        Social identity
      </p>
      <h1 className="mt-2 text-4xl font-black">Clans</h1><p className="mt-3 text-[#d9f3ff]">Discover communities, compare benefits, and contribute tokens to your clan treasury.</p></div>
      <div className="flex justify-end"><button onClick={() => setShowCreate((current) => !current)} className="rounded-lg border border-[#73c8ff] bg-[#18558f] px-4 py-2 text-sm font-black text-[#bde8ff]">Create Clan</button></div>
      {showCreate && <div className="rounded-2xl border border-[#247bc0] bg-[#103f75] p-5"><h2 className="text-xl font-black text-[#bde8ff]">Create a clan · 5,000 tokens</h2><div className="mt-3 grid gap-3 sm:grid-cols-3"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Clan name" className="rounded-xl border border-[#3d91cd] bg-[#0c3b70] px-3 py-3 text-white" /><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description" className="rounded-xl border border-[#3d91cd] bg-[#0c3b70] px-3 py-3 text-white" /><input value={tags.join(", ")} onChange={(event) => setTags(event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 3))} placeholder="Up to 3 tags" className="rounded-xl border border-[#3d91cd] bg-[#0c3b70] px-3 py-3 text-white" /></div><button onClick={() => { if (player.tokens >= 5000 && name.trim() && tags.length <= 3) { savePlayer({ ...player, tokens: player.tokens - 5000 }); setClanState({ name, description, tags, members: 1, treasury: 0 }); setClan(name.slice(0, 5)); setShowCreate(false); } }} className="mt-3 rounded-xl bg-[#39a8f5] px-4 py-3 font-black text-[#031426]">Create clan</button></div>}
      {clan && <div className="rounded-2xl border border-[#73c8ff] bg-[#18558f] p-5"><h2 className="text-xl font-black">{clan.name}</h2><p className="mt-1 text-[#d9f3ff]">{clan.description}</p><p className="mt-2 text-sm text-[#bde8ff]">{clan.members}/25 members · Treasury {clan.treasury}</p><button onClick={() => { if (player.tokens >= 100) { savePlayer({ ...player, tokens: player.tokens - 100 }); setClanState({ ...clan, treasury: clan.treasury + 100 }); } }} className="mt-3 rounded-xl bg-[#39a8f5] px-4 py-3 font-black text-[#031426]">Donate 100 tokens</button><p className="mt-2 text-xs text-[#d9f3ff]">Warning: donated tokens cannot be withdrawn by members; only the clan leader can withdraw the treasury.</p></div>}
      <div className="rounded-3xl border border-[#247bc0] bg-[#103f75] p-6"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-[#bde8ff]">Discovery</p><h2 className="mt-1 text-2xl font-black">Find your people</h2></div><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter tags" className="w-40 rounded-xl border border-[#3d91cd] bg-[#0c3b70] px-3 py-2 text-white" /></div><div className="mt-5 grid gap-3 md:grid-cols-3">{clans.map((item) => <article key={item.name} className="rounded-2xl border border-[#3d91cd] bg-[#18558f] p-4"><h3 className="font-black text-[#bde8ff]">{item.name}</h3><p className="mt-2 text-sm text-[#d9f3ff]">{item.description}</p><div className="mt-3 flex flex-wrap gap-1">{item.tags.map((tag) => <span key={tag} className="rounded-full bg-[#0c3b70] px-2 py-1 text-xs text-[#bde8ff]">#{tag}</span>)}</div><p className="mt-3 text-xs text-[#9cc8e8]">{item.members}/25 members · {item.treasury} treasury</p></article>)}</div></div>
    </div>
  );
}
function CraftingTab({
  player,
  salvage,
  craft,
}: {
  player: Player;
  salvage: (name: string) => void;
  craft: (material: string) => void;
}) {
  const [search, setSearch] = useState("");
  const unique = player.inventory.filter(
    (name, index, items) => items.indexOf(name) === index,
  ).filter((name) => name.toLowerCase().includes(search.toLowerCase()));
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#ffe2a0]">
        Workshop
      </p>
      <h1 className="mt-2 text-4xl font-black">Crafting</h1>
      <p className="mt-2 text-[#d7b88c]">
        Break down a Blook, collect materials, and build something new.
      </p>
      <div className="mt-8 rounded-3xl border border-[#d49a4a]/25 bg-[#3a2415] p-5 sm:p-7">
        <div className="flex items-center justify-between gap-4">
          <div><p className="text-xs font-bold uppercase tracking-widest text-[#ffe2a0]">Your stock</p><h2 className="mt-1 text-2xl font-black">Materials</h2></div>
          <span className="rounded-full px-3 py-1 text-xs font-bold text-[#d7b88c]">6 resources</span>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-6">
          {materialNames.map((material) => (
            <div key={material} title={material} className="material-tile flex flex-col items-center rounded-2xl bg-[#24170f] p-3">
              <img src={materialArtFor(material)} alt={material} className="material-silhouette h-16 w-16 object-contain" />
              <strong className="mt-2 text-xl text-[#ffe2a0]">{player.materials[material] || 0}</strong>
              <span className="sr-only">{material}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-3xl border border-[#d49a4a]/25 bg-[#3a2415] p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-[#ffe2a0]">Recycle station</p><h2 className="mt-1 text-2xl font-black">Dismantle</h2></div><div className="rounded-xl bg-[#24170f] px-3 py-2 text-center text-xs text-[#d7b88c]">+5<br /><b className="text-[#ffe2a0]">bundle</b></div></div>
          <div className="mt-5 flex items-center gap-3 rounded-xl bg-[#24170f] px-3 py-2"><span className="text-[#e9bd67]">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a Blook" className="min-w-0 flex-1 bg-transparent text-white outline-none" /></div>
          <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-4">
            {unique.map((name) => (
              <button key={name} disabled={player.inventory.length <= 1} onClick={() => salvage(name)} title={player.inventory.length <= 1 ? "Keep at least one Blook in your collection" : `Dismantle ${name}`} aria-label={`Dismantle ${name}`} className="group flex aspect-square flex-col items-center justify-center rounded-2xl bg-[#24170f] p-2 disabled:cursor-not-allowed disabled:opacity-35">
                <img src={artFor(name)} alt={name} className="h-16 w-16 object-contain transition group-hover:scale-110" /><span className="mt-1 max-w-full truncate text-[10px] font-bold text-[#f0d7ae]">{name}</span><span className="mt-1 flex items-center gap-1">{bundleEntries(dismantleBundleFor(name, rarityFor(name))).map(([material, amount]) => <span key={material} title={`${amount} ${material}`} className="relative"><img src={materialArtFor(material)} alt="" className="h-5 w-5 object-contain" /><b className="absolute -right-1 -top-1 rounded-full bg-[#e9bd67] px-1 text-[8px] text-[#29170c]">{amount}</b></span>)}</span>
              </button>
            ))}
          </div>
          {!unique.length && <p className="mt-6 text-center text-sm text-[#b58d68]">No Blooks found.</p>}
        </div>
        <div className="rounded-3xl border border-[#d49a4a]/25 bg-[#3a2415] p-5 sm:p-7">
          <p className="text-xs font-bold uppercase tracking-widest text-[#ffe2a0]">Assembly line</p><h2 className="mt-1 text-2xl font-black">Craftable Blooks</h2>
          <div className="mt-5 space-y-3">
            {craftRecipes.map((recipe) => { const enough = bundleEntries(recipe.ingredients).every(([material, amount]) => (player.materials[material] || 0) >= amount); return <button key={recipe.name} onClick={() => craft(recipe.name)} title={`Craft ${recipe.name}`} aria-label={`Craft ${recipe.name}`} className="craft-process group flex w-full items-center gap-3 rounded-2xl bg-[#24170f] p-3 text-left"><span className="flex min-h-12 min-w-12 shrink-0 items-center justify-center gap-0.5 rounded-xl bg-[#6c4328] p-1">{bundleEntries(recipe.ingredients).map(([material, amount]) => <span key={material} title={`${amount} ${material}`} className="relative"><img src={materialArtFor(material)} alt="" className="h-7 w-7 object-contain" /><b className="absolute -right-1 -top-1 rounded-full bg-[#e9bd67] px-1 text-[8px] text-[#29170c]">{amount}</b></span>)}</span><span className="h-px flex-1 bg-[#8e623c]" /><span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-[#d49a4a]/40 bg-[#3a2415]"><img src={artFor(recipe.name)} alt={recipe.name} className="h-14 w-14 object-contain" /></span><span className="min-w-0 flex-1"><strong className="block truncate">{recipe.name}</strong><small className={enough ? "text-[#e9bd67]" : "text-[#b58d68]"}>{enough ? "Ready to craft" : "20 total materials"}</small></span><span className={`text-2xl transition group-hover:translate-x-1 ${enough ? "text-[#ffe2a0]" : "text-[#8e623c]"}`}>→</span></button>; })}
          </div>
        </div>
      </div>
    </div>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[#24170f]/70 p-4">
      <p className="text-xs uppercase tracking-widest text-[#b58d68]">
        {label}
      </p>
      <p className="mt-2 text-xl font-black text-[#ffe2a0]">{value}</p>
    </div>
  );
}
