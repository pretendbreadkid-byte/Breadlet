"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  ChevronDown,
  Image as ImageIcon,
  HelpCircle,
  LogOut,
  Search,
  GitBranch,
  CirclePlay,
  Package,
} from "lucide-react";

type Tab =
  | "profile"
  | "capsules"
  | "inventory"
  | "wheel"
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
type Listing = { id: number | string; seller: string; blook: string; price: number };
type Player = {
  id?: string;
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
  wheelSpun?: boolean;
  guestStarterRemoved?: boolean;
};
type NavItem = { id: Tab; label: string; icon: React.ReactNode };

const playerKey = "breadlet-player";
const guestPlayerKey = "breadlet-guest-player";
const wheelSpinKey = "breadlet-wheel-spun";
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
    "Aztec Coin": "/assets/Aztect Coin 2.0.svg",
    Map: "/assets/map (1).svg",
    "Pixel Toast": "/assets/Pixel bread.png",
    "Pixel Chick": "/assets/pixel-chick.png",
    "Pixel Ice Slime": "/assets/pixel ice slime.png",
    "Lava Slime": "/assets/lava-slime.svg",
    "Olive Grenade": "/assets/grenade.png",
    "Golden Grenade": "/assets/golden grenade.png",
    "Sour Dough": "/assets/Bread.svg",
    "Burnt Toast": "/assets/Burnt toast.svg",
    Brioche: "/assets/brioche.svg",
    Chef: "/assets/chef (1).svg",
    Earth: "/assets/earrth.svg",
    Surgeon: "/assets/surgeon.svg",
    Doctor: "/assets/doctor 2.0.svg",
    "Crystal Ball": "/assets/crystal ball 2.0.svg",
    "Pixel Fuego": "/assets/pixel fuego.png",
    "Pixel Wizard": "/assets/pixel wizard.png",
    "Blooket Life": "/assets/new blooket life.png",
    "Blooket Gods": "/assets/new blooket gods.png",
    Lagoon: "/assets/New Lag0n.png",
    Shuriken: "/assets/shuricken.svg",
    "Albino Crow": "/assets/albino crow.svg",
    Baguette: "/assets/bagget.svg",
    Star: "/assets/star (1).svg",
    Consolation: "/assets/contilation.svg",
    "Laser Blaster": "/assets/contilation.svg",
    "Yellow Platypus": "/assets/yellowplatypus.svg",
    Eclipse: "/assets/eclipse 2.0.svg",
    Necklace: "/assets/neclase 2.0 .svg",
    Ninja: "/assets/Ninja 2.0.svg",
    Santa: "/assets/santa pixel.png",
    "Fasty Jay": "/assets/fastyjaynew.png",
    Waymore: "/assets/new waymore.png",
    Shield: "/assets/sheild (1).svg",
    Spartan: "/assets/spartin  (1).svg",
    Solider: "/assets/solider.svg",
    "Gold Bread": "/assets/golden loaf.svg",
    "Stone Tablet": "/assets/Stone tablet (1).svg",
    Actor: "/assets/actor.svg",
    Alien: "/assets/Alien (2).svg",
    "Crimson Octopus": "/assets/crimsonoctopus.svg",
    Caveman: "/assets/caveman.svg",
    Timeglass: "/assets/Time glass final animation.svg",
    "Pixel UFO": "/assets/pixel planet.png",
    "Star Ship": "/assets/star ship frame 1.svg",
    "Bread Blook": "/assets/breadblook.jpg",
    "Golden Shuriken": "/assets/golden-shuriken.svg",
    "Holy Bread": "/assets/holy bread.svg",
    "Red Rex": "/assets/red-rex.svg",
    "Golden UFO": "/assets/golden tim the alien.png",
    "Mr. Receipt": "/assets/mr-receipt.svg",
    "Mr. Frog": "/assets/Mr.frog.svg",
    Donut: "/assets/bagel.svg",
    "Cinnamon Roll": "/assets/cinimmon role.svg",
    "Green Astronaut": "/assets/new the green astronaut.png",
    Astronaut: "/assets/new the green astronaut.png",
    "Rainbow Astro": "/assets/rainbowastronaut.svg",
    "Phantom Kind": "/assets/phantomking.svg",
    "Phantom King": "/assets/phantomking.svg",
    Megabot: "/assets/megabot.svg",
    King: "/assets/king.svg",
    Yeti: "/assets/yeti.svg",
    Megalodon: "/assets/megalodon.svg",
    Lion: "/assets/lion.svg",
    "Sugar Glider": "/assets/sugar-glider.svg",
    "Tyrannosaurus Rex": "/assets/tyrannosaurus-rex.svg",
    Sandwich: "/assets/sandwich.svg",
    Butterfly: "/assets/butterfly (1).svg",
    Blackbeard: "/assets/captainblackbeard (1).svg",
  })[name.replace(/^Shiny /, "")] || "/assets/Bread.svg";
const rarityBudget: Record<string, number> = {
  Common: 50,
  Uncommon: 25,
  Rare: 15,
  Epic: 9.3,
  Legendary: 0.5,
  Mythic: 0.2,
  Unique: 0.2,
  Transcendent: 0.025,
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
const rarityTileClass = (rarity: string) => {
  const classes: Record<string, string> = {
    Common: "border-slate-400/40 bg-slate-400/10 text-slate-200",
    Uncommon: "border-emerald-400/50 bg-emerald-500/10 text-emerald-200",
    Rare: "border-sky-400/50 bg-sky-500/10 text-sky-200",
    Epic: "border-violet-400/50 bg-violet-500/10 text-violet-200",
    Legendary: "border-amber-400/60 bg-amber-500/10 text-amber-200",
    Mythic: "border-rose-400/60 bg-rose-500/10 text-rose-200",
    Unique: "border-fuchsia-400/60 bg-fuchsia-500/10 text-fuchsia-200",
    Transcendent: "border-yellow-300/70 bg-yellow-400/15 text-yellow-100",
  };
  return classes[rarity] || classes.Common;
};
const rewardEffectClassFor = (name: string, rarity: string) => {
  const cleanName = name.replace(/^Shiny /, "");
  if (cleanName === "Star Ship") return "";
  return `${rarityClassFor(rarity)} ${cleanName === "Bread Blook" ? "rainbow-blook" : ""} ${cleanName === "Holy Bread" ? "golden-glow" : ""} ${cleanName === "Red Rex" ? "red-rex-bounce" : ""} ${cleanName === "Crimson Octopus" ? "crimson-octopus-glow" : ""}`;
};
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
const shinyEligibleNames = new Set<string>();
const shinyNameFor = (name: string) => name;
const materialNames = [
  "Gold",
  "Cloth",
  "Gem",
  "Sugar",
  "Flower",
  "Metal",
];
const dismantleMaterialNames = materialNames;
const wheelRewards = [
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
const wheelRarityFor = (reward: (typeof wheelRewards)[number]) => {
  if (reward.type === "material") return reward.material === "Gem" ? "Legendary" : "Epic";
  if (reward.amount >= 5000) return "Mythic";
  if (reward.amount >= 4000) return "Legendary";
  if (reward.amount >= 2000) return "Epic";
  if (reward.amount >= 1000) return "Rare";
  if (reward.amount >= 500) return "Uncommon";
  return "Common";
};

function playerFromServer(data: any): Player {
  const serverInventory = data.inventory?.length ? data.inventory : ["Bread Blook"];
  const legacyShinyCount = serverInventory.filter((name: string) => name.startsWith("Shiny ")).length;
  const inventory = serverInventory.filter((name: string) => !name.startsWith("Shiny "));
  return {
    id: data.profile.id,
    username: data.profile.username,
    password: "",
    tokens: (data.profile.tokens || 0) + legacyShinyCount * 200,
    mined: data.mine?.current_earnings_today || 0,
    inventory: inventory.length ? inventory : ["Bread Blook"],
    equipped: data.profile.equipped_blook_name?.replace(/^Shiny /, "") || inventory[0] || "Bread Blook",
    pickaxe: Math.max(0, (data.mine?.pickaxe_level || 1) - 1),
    listings: data.listings || [],
    clanTag: data.profile.clan_tag || "",
    materials: { ...emptyMaterials(), ...(data.materials || {}) },
    badges: data.profile.badges || data.profile.stats?.badges || [],
    friends: data.profile.friends || [],
    wheelSpun: Boolean(data.profile.wheel_spun),
  };
}
const materialFor = (name: string, rarity: string) =>
  rarity === "Mythic" || rarity === "Transcendent"
    ? "Gem"
    : rarity === "Legendary"
      ? "Gem"
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
            ? "Gem"
            : dismantleMaterialNames[name.length % dismantleMaterialNames.length];
type MaterialBundle = Record<string, number>;
const bundleEntries = (bundle: MaterialBundle) => Object.entries(bundle);
const dismantleBundleFor = (name: string, rarity: string): MaterialBundle => {
  const primary = materialFor(name, rarity);
  const primaryIndex = dismantleMaterialNames.indexOf(primary);
  const secondary = dismantleMaterialNames[(primaryIndex + name.length + rarity.length) % dismantleMaterialNames.length];
  return {
    [primary]: 3,
    [secondary === primary ? dismantleMaterialNames[(primaryIndex + 1) % dismantleMaterialNames.length] : secondary]: 2,
  };
};
const craftRecipes: { name: string; ingredients: MaterialBundle }[] = [
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
const craftRecipeFor = (name: string) =>
  craftRecipes.find((recipe) => recipe.name === name);
const craftedRarityFor = (name: string) =>
  name === "Rainbow Astro" || name === "Phantom King" ? "Mythic" : "Legendary";
const materialArtFor = (material: string) =>
  ({
    Gold: "/assets/gold.svg",
    Cloth: "/assets/cloth.svg",
    Gem: "/assets/gem.svg",
    Sugar: "/assets/sugar.svg",
    Flower: "/assets/flower.svg",
    Metal: "/assets/metal.svg",
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
      ["Consolation", "Rare"],
      ["Eclipse", "Epic"],
      ["Alien", "Mythic"],
      ["Star Ship", "Transcendent"],
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
      ["Doctor", "Rare"],
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
    art: "/assets/pixel capsule extra new.svg",
    pool: rewards([
      ["Pixel Toast", "Common"],
      ["Pixel Chick", "Common"],
      ["Pixel Ice Slime", "Uncommon"],
      ["Pixel Fuego", "Rare"],
      ["Pixel Wizard", "Rare"],
      ["Pixel UFO", "Mythic"],
    ]),
  },
  {
    name: "Combat Capsule",
    price: 25,
    art: "/assets/combat-capsule-new.svg",
    pool: rewards([
      ["Olive Grenade", "Common"],
      ["Golden Grenade", "Rare"],
      ["Shuriken", "Rare"],
      ["Shield", "Epic"],
      ["Spartan", "Legendary"],
      ["Golden Shuriken", "Mythic"],
    ]),
  },
  {
    name: "BlookTuber Capsule",
    price: 25,
    art: "/assets/Blooktuber Pack.svg",
    pool: rewards([
      ["Blooket Life", "Uncommon"],
      ["Blooket Gods", "Rare"],
      ["Fasty Jay", "Epic"],
      ["Lagoon", "Rare"],
      ["Waymore", "Epic"],
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
  const [isGuest, setIsGuest] = useState(false);
  const [guestProgressUnlocked, setGuestProgressUnlocked] = useState(false);
  const [guestWelcomeOpen, setGuestWelcomeOpen] = useState(false);
  const resetClickCountRef = useRef(0);
  const pendingGuestRef = useRef<Player | null>(null);
  const [authFeedback, setAuthFeedback] = useState("");
  const [supabaseClient] = useState(() => createSupabaseClient());
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [migrationCode, setMigrationCode] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [forgotPassword, setForgotPassword] = useState(false);
  const [tab, setTab] = useState<Tab>("wheel");
  const [notice, setNotice] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [showRetired, setShowRetired] = useState(false);
  const [capsuleToConfirm, setCapsuleToConfirm] = useState<Capsule | null>(null);
  const [reveal, setReveal] = useState<{
    capsule: Capsule;
    reward: Reward;
    track: Reward[];
    winnerIndex: number;
    phase: "charging" | "spinning" | "result";
  } | null>(null);
  const [oddsCapsule, setOddsCapsule] = useState<Capsule | null>(null);
  const [badgeInfo, setBadgeInfo] = useState<string | null>(null);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [massOpen, setMassOpen] = useState(false);
  const [massQuantities, setMassQuantities] = useState<Record<string, number>>({});
  const [massResults, setMassResults] = useState<{ capsule: string; reward: Reward }[]>([]);
  const [pendingDismantle, setPendingDismantle] = useState<string | null>(null);
  const [craftReveal, setCraftReveal] = useState<{ name: string; ingredients: MaterialBundle; phase: "processing" | "charging" | "output" } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [giftChatNotice, setGiftChatNotice] = useState("");
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useEffect(() => {
    const restoreGuest = () => {
      const savedGuest = window.localStorage.getItem(guestPlayerKey);
      if (!savedGuest) return false;
      setPlayer(JSON.parse(savedGuest));
      setIsGuest(true);
      setGuestProgressUnlocked(true);
      return true;
    };
    if (supabaseClient) {
      supabaseClient.auth.getUser().then(async ({ data }) => {
        if (!data.user) {
          restoreGuest();
          return;
        }
        const response = await fetch("/api/player");
        if (response.ok) {
          setIsGuest(false);
          setPlayer(playerFromServer(await response.json()));
          return;
        }
        restoreGuest();
      });
      return;
    }
    if (restoreGuest()) return;
    const saved = window.localStorage.getItem(playerKey);
    if (saved) {
      const old = JSON.parse(saved);
      if (old.password)
        (() => {
          const legacyShinyCount = Array.isArray(old.inventory) ? old.inventory.filter((name: string) => name.startsWith("Shiny ")).length : 0;
          const inventory = (old.inventory || []).filter((name: string) => !name.startsWith("Shiny "));
        setPlayer({
          listings: [],
          pickaxe: 0,
          clanTag: "",
          ...old,
          tokens: (old.tokens || 0) + legacyShinyCount * 200,
          inventory: inventory.length ? inventory : ["Bread Blook"],
          equipped: String(old.equipped || "Bread Blook").replace(/^Shiny /, ""),
          materials: { ...emptyMaterials(), ...(old.materials || {}) },
          badges: old.badges || [],
          friends: old.friends || [],
        });
        })();
    }
  }, [supabaseClient]);
  useEffect(() => {
    if (!player || isGuest || player.wheelSpun) return;
    if (window.localStorage.getItem(`${wheelSpinKey}:${player.username}`) === "1") {
      setPlayer((current) => current ? { ...current, wheelSpun: true } : current);
    }
  }, [isGuest, player?.username, player?.wheelSpun]);
  useEffect(() => {
    if (!supabaseClient) return;
    fetch("/api/admin").then((response) => setAdminUnlocked(response.ok)).catch(() => setAdminUnlocked(false));
  }, [supabaseClient]);
  useEffect(() => {
    const logo = document.querySelector('header img[alt="Breadlet logo"]');
    if (!logo) return;
    const goToProfile = () => setTab("wheel");
    logo.addEventListener("click", goToProfile);
    return () => logo.removeEventListener("click", goToProfile);
  }, []);
  const save = (next: Player) => {
    setPlayer(next);
    if (isGuest) {
      if (guestProgressUnlocked) {
        window.localStorage.setItem(guestPlayerKey, JSON.stringify(next));
      }
      return;
    }
    if (supabaseClient) {
      void fetch("/api/player", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player: next }),
      }).then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          setNotice(body?.error || "Could not save your player data.");
        }
      });
      return;
    }
    window.localStorage.setItem(playerKey, JSON.stringify(next));
  };
  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (forgotPassword) {
      resetClickCountRef.current += 1;
      const clicks = resetClickCountRef.current;
      if (clicks === 5) {
        setGuestProgressUnlocked(true);
        const guestToSave = isGuest ? player : pendingGuestRef.current;
        if (guestToSave) {
          window.localStorage.setItem(guestPlayerKey, JSON.stringify(guestToSave));
        }
        pendingGuestRef.current = null;
        setAuthFeedback("Secret unlocked: guest progress will now be saved in this browser.");
        return;
      }
      if (clicks > 1) {
        setAuthFeedback(`${5 - clicks} more reset clicks to unlock guest saves.`);
        return;
      }
      if (username.trim().length < 3) {
        setNotice("Enter your username first.");
        return;
      }
      const resetResponse = await fetch("/api/auth/reset-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() }),
      });
      const resetBody = await resetResponse.json().catch(() => null);
      setAuthFeedback(resetBody?.message || resetBody?.error || "Password reset request failed.");
      return;
    }
    if (username.trim().length < 3 || password.length < 4) {
      setNotice(
        "Use a username with 3+ characters and a password with 4+ characters.",
      );
      return;
    }
    if (supabaseClient) {
      let result: { error: { message: string } | null; data?: { session?: unknown } };
      if (authMode === "signup") {
        const signupResponse = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), username: username.trim(), password }),
        });
        const signupBody = await signupResponse.json().catch(() => null);
        if (!signupResponse.ok) {
          result = { error: { message: signupBody?.error || "Could not create your account." } };
        } else {
          const loginResponse = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: username.trim(), password }),
          });
          const loginBody = await loginResponse.json().catch(() => null);
          result = { error: loginResponse.ok ? null : { message: loginBody?.error || "Account created, but automatic login failed." } };
        }
      } else {
        const loginResponse = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: username.trim(), password }),
        });
        const loginBody = await loginResponse.json().catch(() => null);
        result = { error: loginResponse.ok ? null : { message: loginBody?.error || "Log in failed. Check your username and password, then try again." } };
      }
      let createdAccount = authMode === "signup";
      if (result.error) {
        setNotice(authMode === "signup" ? result.error.message : "Log in failed. Check your username and password, then try again.");
        return;
      }
      await fetch("/api/player", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: username.trim(), tokens: 250, materials: emptyMaterials() }) });
      if (createdAccount && migrationCode.trim()) {
        const migration = await fetch("/api/migration/redeem", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: migrationCode.trim() }) });
        if (!migration.ok) setNotice((await migration.json().catch(() => null))?.error || "Migration could not be redeemed.");
      }
      const response = await fetch("/api/player");
      if (response.ok) {
        pendingGuestRef.current = null;
        setIsGuest(false);
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
      wheelSpun: false,
    });
    setIsGuest(false);
    setNotice("Welcome to Breadlet.");
  };
  const startGuest = () => {
    const savedGuest = window.localStorage.getItem(guestPlayerKey);
    const storedPlayer: Player | null = savedGuest ? JSON.parse(savedGuest) : pendingGuestRef.current;
    const guestInventory = storedPlayer ? [...storedPlayer.inventory] : [];
    if (storedPlayer && !storedPlayer.guestStarterRemoved) {
      const oldStarterIndex = guestInventory.indexOf("Bread Blook");
      if (oldStarterIndex !== -1) guestInventory.splice(oldStarterIndex, 1);
    }
    const guestPlayer: Player = storedPlayer ? {
      ...storedPlayer,
      inventory: guestInventory,
      equipped: storedPlayer.equipped === "Bread Blook" && !guestInventory.includes("Bread Blook") ? guestInventory[0] || "" : storedPlayer.equipped,
      materials: { ...emptyMaterials(), ...storedPlayer.materials },
      guestStarterRemoved: true,
    } : {
      username: "Guest",
      password: "",
      tokens: 250,
      mined: 0,
      inventory: [],
      equipped: "",
      pickaxe: 0,
      listings: [],
      clanTag: "",
      materials: emptyMaterials(),
      badges: [],
      friends: [],
      wheelSpun: false,
      guestStarterRemoved: true,
    };
    setIsGuest(true);
    setPlayer(guestPlayer);
    pendingGuestRef.current = null;
    setTab("wheel");
    setShowRetired(true);
    setNotice("");
    setGuestWelcomeOpen(true);
    if (guestProgressUnlocked) {
      window.localStorage.setItem(guestPlayerKey, JSON.stringify(guestPlayer));
    }
  };
  const addFriend = async (friendUsername: string) => {
    if (!player || !supabaseClient) {
      if (player) save({ ...player, friends: Array.from(new Set([...(player.friends || []), friendUsername])) });
      return;
    }
    const searchResponse = await fetch(`/api/players/search?q=${encodeURIComponent(friendUsername)}`);
    const matches = searchResponse.ok ? await searchResponse.json() : [];
    const match = Array.isArray(matches) ? matches.find((item: { username: string }) => item.username.toLowerCase() === friendUsername.toLowerCase()) : null;
    if (!match) {
      setNotice("Player not found.");
      return;
    }
    const response = await fetch("/api/friends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ friendProfileId: match.id }),
    });
    if (!response.ok) {
      setNotice("Could not send the friend request.");
      return;
    }
    save({ ...player, friends: Array.from(new Set([...(player.friends || []), match.username])) });
    setNotice(`Friend request sent to ${match.username}.`);
  };
  const spinWheel = (reward: (typeof wheelRewards)[number]) => {
    if (!player) return;
    if (player.wheelSpun && !isGuest) {
      setNotice("You already spun today's wheel.");
      return;
    }
    const nextMaterials = { ...player.materials };
    if (reward.type === "material" && reward.material) {
      nextMaterials[reward.material] = (nextMaterials[reward.material] || 0) + reward.amount;
    }
    save({
      ...player,
      tokens: reward.type === "tokens" ? player.tokens + reward.amount : player.tokens,
      materials: nextMaterials,
      wheelSpun: !isGuest,
    });
    if (!isGuest) window.localStorage.setItem(`${wheelSpinKey}:${player.username}`, "1");
    if (!isGuest) setNotice(`Wheel reward: ${reward.label}.`);
  };
  const openCapsule = (capsule: Capsule) => {
    if (!player) return;
    if (!isGuest && player.tokens < capsule.price) {
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
    const winnerIndex = 28;
    const track = Array.from({ length: 36 }, (_, index) =>
      index === winnerIndex
        ? finalReward
        : capsule.pool[Math.floor(Math.random() * capsule.pool.length)],
    );
    const next = { ...player, tokens: isGuest ? player.tokens : player.tokens - capsule.price };
    save(next);
    setReveal({ capsule, reward: finalReward, track, winnerIndex, phase: "charging" });
    window.setTimeout(() => {
      setReveal((current) => current ? { ...current, phase: "spinning" } : null);
    }, 950);
    window.setTimeout(() => {
      save({ ...next, inventory: [...next.inventory, finalReward.name] });
      setReveal((current) => current ? { ...current, phase: "result" } : null);
    }, 5600);
  };
  const openMassCapsules = (quantities: Record<string, number>) => {
    if (!player) return;
    const openableCapsules = isGuest ? [...liveCapsules, ...retiredCapsules] : liveCapsules;
    const selected = openableCapsules.flatMap((capsule) =>
      Array.from({ length: quantities[capsule.name] || 0 }, () => capsule),
    );
    const cost = selected.reduce((total, capsule) => total + capsule.price, 0);
    if (!selected.length) {
      setNotice("Choose at least one capsule to mass open.");
      return;
    }
    if (!isGuest && player.tokens < cost) {
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
      tokens: isGuest ? player.tokens : player.tokens - cost,
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
    if (!isGuest && player.tokens < upgrade.cost) {
      setNotice(`You need ${upgrade.cost} tokens for ${upgrade.name}.`);
      return;
    }
    save({ ...player, tokens: isGuest ? player.tokens : player.tokens - upgrade.cost, pickaxe: index });
    setNotice(`${upgrade.name} equipped.`);
  };
  const createListing = async (blook: string, price: number) => {
    if (
      !player ||
      !player.inventory.includes(blook) ||
      price > 100000 ||
      price < 1
    ) {
      setNotice("Choose an owned Blook and a price from 1 to 100,000.");
      return;
    }
    if (supabaseClient && !isGuest) {
      const res = await fetch("/api/marketplace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", blook, price }),
      });
      if (res.ok) {
        const index = player.inventory.indexOf(blook);
        const inventory = player.inventory.filter((_, i) => i !== index);
        const nextPlayer = {
          ...player,
          inventory,
          equipped: player.equipped === blook ? inventory[0] || "Bread Blook" : player.equipped,
        };
        const listRes = await fetch("/api/marketplace");
        if (listRes.ok) {
          const rows = await listRes.json();
          nextPlayer.listings = rows;
        }
        setPlayer(nextPlayer);
        setNotice(`${blook} listed in the Bazaar.`);
        return;
      }
    }
    const listing = { id: Date.now(), seller: player.username, blook, price };
    save({ ...player, listings: [...player.listings, listing] });
    setNotice(`${blook} listed in the Bazaar.`);
  };
  const buyListing = async (listing: Listing) => {
    if (!player) return;
    if (!isGuest && player.tokens < listing.price) {
      setNotice("You need more tokens for this listing.");
      return;
    }
    if (supabaseClient && !isGuest && typeof listing.id === "string") {
      const res = await fetch("/api/marketplace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "buy", listingId: listing.id }),
      });
      if (res.ok) {
        const nextPlayer = {
          ...player,
          tokens: player.tokens - listing.price,
          inventory: [...player.inventory, listing.blook],
        };
        const listRes = await fetch("/api/marketplace");
        if (listRes.ok) {
          const rows = await listRes.json();
          nextPlayer.listings = rows;
        }
        setPlayer(nextPlayer);
        setSelectedListing(null);
        setNotice(`${listing.blook} purchased.`);
        return;
      }
    }
    save({ ...player, tokens: isGuest ? player.tokens : player.tokens - listing.price, inventory: [...player.inventory, listing.blook], listings: player.listings.filter((item) => item.id !== listing.id) });
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
  const grantReward = async (targetId: string, reward: { tokens?: number; blookName?: string; badge?: string }) => {
    if (!adminUnlocked) return;
    const response = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetId, ...reward }) });
    if (!response.ok) return setNotice((await response.json().catch(() => null))?.error || "Admin grant failed.");
    setNotice("Reward granted.");
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
    const missing = isGuest ? undefined : bundleEntries(recipe.ingredients).find(
      ([material, amount]) => (player.materials[material] || 0) < amount,
    );
    if (missing) {
      setNotice(`You need more ${missing[0]} to craft ${name}.`);
      return;
    }
    const materials = { ...player.materials };
    if (!isGuest) {
      bundleEntries(recipe.ingredients).forEach(([material, amount]) => {
        materials[material] = (materials[material] || 0) - amount;
      });
    }
    const next = { ...player, materials };
    save(next);
    setCraftReveal({ name, ingredients: recipe.ingredients, phase: "processing" });
    window.setTimeout(() => {
      setCraftReveal((current) => current ? { ...current, phase: "charging" } : null);
    }, 1400);
    window.setTimeout(() => {
      save({ ...next, inventory: [...next.inventory, name] });
      setCraftReveal({ name, ingredients: recipe.ingredients, phase: "output" });
    }, 2700);
  };
  const setClan = (tag: string) => {
    if (player) {
      save({ ...player, clanTag: tag.trim().slice(0, 5).toUpperCase() });
      setNotice(
        `Clan tag set to ${tag.trim().slice(0, 5).toUpperCase() || "none"}.`,
      );
    }
  };
  const leaveSession = () => {
    if (isGuest && player && !guestProgressUnlocked) {
      pendingGuestRef.current = player;
    }
    setPlayer(null);
    setIsGuest(false);
    setUserMenuOpen(false);
    if (!isGuest) supabaseClient?.auth.signOut();
    window.localStorage.removeItem(playerKey);
  };
  if (!player)
    return (
      <LoginScreen
        username={username}
        email={email}
        password={password}
        migrationCode={migrationCode}
        setUsername={setUsername}
        setEmail={setEmail}
        setPassword={setPassword}
        setMigrationCode={setMigrationCode}
        authMode={authMode}
        setAuthMode={setAuthMode}
        forgotPassword={forgotPassword}
        setForgotPassword={setForgotPassword}
        login={login}
        notice={notice}
        closeNotice={() => setNotice("")}
        authFeedback={authFeedback}
        startGuest={startGuest}
        resetClickCountRef={resetClickCountRef}
        setAuthFeedback={setAuthFeedback}
      />
    );
  const nav: NavItem[] = [
    { id: "wheel", label: "Daily Crate", icon: <Package size={20} strokeWidth={2.2} /> },
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
  ];
  const visibleNav = isGuest
    ? nav.filter((item) => !["clan", "market", "chat", "leaderboard"].includes(item.id))
    : nav;
  return (
    <main className="breadlet-blue-theme min-h-screen bg-[#0c3b70] text-white flex flex-col md:h-screen md:overflow-hidden md:flex-row">
      <div className="bread-floaters" aria-hidden="true">
        {Array.from({ length: 120 }).map((_, i) => (
          <img
            key={i}
            src={
              i % 3 === 0
                ? "/assets/bread-silhouette-loaf.svg"
                : i % 3 === 1
                  ? "/assets/bread-silhouette-oval.svg"
                  : "/assets/bread-silhouette-ring.svg"
            }
            alt=""
            className="bread-floater"
          />
        ))}
      </div>

      {/* Left Blooket-style Persistent Sidebar */}
      <aside className="w-full md:w-52 md:h-screen md:overflow-y-auto shrink-0 border-r border-[#3d91cd]/30 bg-[#072a54] p-3 flex flex-col justify-between z-20 shadow-xl">
        <div>
          {/* Logo Header */}
          <div className="flex items-center gap-3 px-1 py-2 cursor-pointer" onClick={() => setTab("wheel")}>
            <div className="flex w-full items-center gap-2 border-b border-[#3d91cd]/40 pb-3"><img src="/assets/breadlet-logo.svg" alt="Breadlet logo" className="h-14 w-14 shrink-0 object-contain" /><div className="min-w-0"><p className="text-3xl font-black uppercase leading-none text-white">Breadlet</p><p className="mt-1 text-[10px] font-bold tracking-widest text-[#bde8ff]">BRED-lit</p></div></div>
          </div>

          {/* Sidebar Nav Buttons */}
          <nav className="mt-6 space-y-1.5">
            {visibleNav.map((item) => (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 font-extrabold text-sm transition ${
                  tab === item.id
                    ? "bg-[#39a8f5] text-white shadow-md"
                    : "text-[#9cc8e8] hover:bg-[#103f75] hover:text-white"
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Sidebar Footer Controls */}
        <div className="mt-8 pt-4 border-t border-[#3d91cd]/20 flex items-center justify-around text-white">
          <a title="GitHub" href="https://github.com/pretendbreadkid-byte/Breadlet/tree/master" target="_blank" rel="noreferrer" className="hover:text-[#bde8ff] transition"><GitBranch size={18} /></a>
          <a title="YouTube" href="https://www.youtube.com/@Breadblook" target="_blank" rel="noreferrer" className="hover:text-[#bde8ff] transition"><CirclePlay size={18} /></a>
          <a title="Discord" href="https://discord.gg/ENBbs6ewb" target="_blank" rel="noreferrer" className="hover:text-[#bde8ff] transition"><MessageCircle size={18} /></a>
          <button title={isGuest ? "End guest session" : "Log out"} onClick={leaveSession} className="hover:text-red-300 transition"><LogOut size={20} /></button>
        </div>
      </aside>

      {/* Main Workspace Column */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Top Header Bar */}
        <div className="workspace-island pointer-events-none fixed right-3 top-3 z-30 flex w-fit max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-2xl border border-[#3d91cd]/50 bg-[#103f75] px-2 py-2 shadow-xl sm:right-5 sm:top-5 sm:gap-3 sm:px-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            {/* Tokens Balance Counter */}
            <div className="flex items-center gap-1.5 px-1 font-black text-[#ffe2a0] text-xs">
              <img src="/assets/coin.svg" alt="Tokens" className="h-5 w-5" />
              <span className="text-sm">{player.tokens.toLocaleString()}</span>
            </div>

            {/* Corner Username Dropdown */}
            <div className="relative pointer-events-auto">
              <button
                onClick={() => setUserMenuOpen((prev) => !prev)}
                className="flex max-w-[calc(100vw-8rem)] items-center gap-2 rounded-xl border border-[#3d91cd] bg-[#103f75] px-2 py-2 font-black text-[#bde8ff] transition hover:bg-[#18558f] sm:max-w-none sm:gap-2.5 sm:px-3.5"
              >
                <div className="h-6 w-6 rounded-lg overflow-hidden bg-[#072a54] p-0.5 border border-white/30 flex items-center justify-center">
                  {player.equipped ? <img src={artFor(player.equipped)} alt="" className="h-full w-full object-contain" /> : <CircleUserRound size={18} className="text-[#9cc8e8]" />}
                </div>
                <span className="whitespace-nowrap">{player.username}</span>
                <ChevronDown size={18} />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-[#3d91cd] bg-[#103f75] p-2 shadow-2xl z-[9999]">
                  <button
                    onClick={() => {
                      setTab("profile");
                      setUserMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-[#bde8ff] hover:bg-[#18558f]"
                  >
                    <CircleUserRound size={18} />
                    Profile
                  </button>
                  <button
                    onClick={() => {
                      setTab("promo");
                      setUserMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-[#bde8ff] hover:bg-[#18558f]"
                  >
                    <Percent size={18} />
                    Promo Codes
                  </button>
                  <button
                    onClick={() => {
                      setTab("info");
                      setUserMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-[#bde8ff] hover:bg-[#18558f]"
                  >
                    <HelpCircle size={18} />
                    Info & Guide
                  </button>
                  {adminUnlocked && (
                    <button
                      onClick={() => {
                        setTab("admin");
                        setUserMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-[#ffe2a0] hover:bg-[#18558f]"
                    >
                      <Crown size={18} />
                      Admin Panel
                    </button>
                  )}
                  <hr className="my-1 border-[#3d91cd]/40" />
                  <button
                    onClick={() => {
                      leaveSession();
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-red-300 hover:bg-red-900/30"
                  >
                    <LogOut size={18} />
                    Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Dynamic Page Section */}
        <section className="flex-1 p-6 overflow-y-auto">
          {isGuest && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/30 bg-amber-200/10 px-4 py-3 text-sm text-amber-100"><span>Guest mode · all game actions are free · {guestProgressUnlocked ? "progress saves in this browser" : "progress resets when you leave"}</span><button onClick={leaveSession} className="font-black underline decoration-amber-200/50 underline-offset-4">{guestProgressUnlocked ? "Exit guest" : "End session"}</button></div>}
          {notice && (
            <div className="modal-layer fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 px-5 backdrop-blur-sm">
              <div className="w-full max-w-sm rounded-3xl border border-[#3d91cd] bg-[#103f75] p-6 text-center shadow-2xl">
                <p className="text-xl font-black text-[#bde8ff]">Breadlet Update</p>
                <p className="mt-3 text-sm text-[#d9f3ff]">{notice}</p>
                <button onClick={() => setNotice("")} className="mt-6 w-full rounded-2xl bg-[#39a8f5] px-4 py-3 font-black text-[#031426] hover:bg-[#73c8ff] shadow-md transition">Close</button>
              </div>
            </div>
          )}
          {tab === "profile" && <ProfileTab player={player} setTab={setTab} showBadge={setBadgeInfo} savePlayer={save} addFriend={addFriend} isGuest={isGuest} />}
          {tab === "wheel" && <WheelTab player={player} spin={spinWheel} isGuest={isGuest} />}
          {tab === "capsules" && (
            <CapsulesTab
              showRetired={showRetired}
              setShowRetired={setShowRetired}
              openCapsule={(capsule) => setCapsuleToConfirm(capsule)}
              showOdds={setOddsCapsule}
              openMass={() => setMassOpen(true)}
              playerTokens={player.tokens}
              isGuest={isGuest}
            />
          )}
          {tab === "inventory" && (
            <InventoryTab player={player} equip={equip} sell={sell} />
          )}
          {tab === "market" && (
            <Bazaar
              player={player}
              createListing={createListing}
              openListing={setSelectedListing}
                isGuest={isGuest}
              setPlayerListings={(listings) => setPlayer((prev) => (prev ? { ...prev, listings } : null))}
            />
          )}
          {tab === "chat" && <ChatTab player={player} showBadge={setBadgeInfo} giftNotice={giftChatNotice} clearGiftNotice={() => setGiftChatNotice("")} isGuest={isGuest} />}
          {tab === "leaderboard" && <Leaderboard player={player} />}
          {tab === "clan" && <ClanTab player={player} setClan={setClan} savePlayer={save} isGuest={isGuest} />}
          {tab === "crafting" && (
            <CraftingTab player={player} salvage={(name) => setPendingDismantle(name)} craft={craft} isGuest={isGuest} />
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
              grantReward={grantReward}
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
      </div>
      {guestWelcomeOpen && (
        <div className="modal-layer fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 px-5 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-emerald-300/40 bg-[#10251f] p-6 text-white shadow-2xl">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-300">Guest test session</p>
            <h2 className="mt-2 text-2xl font-black">Everything is open to try</h2>
            <ul className="mt-4 space-y-2 text-sm leading-6 text-emerald-50/80">
              <li>Crates and every capsule, including retired boxes, are free to open.</li>
              <li>Crafting is free, and guests start with an empty collection.</li>
              <li>Chat, ranks, clans, and Bazaar are hidden during guest testing.</li>
              <li>Progress is temporary and disappears when you end this session unless you have unlocked browser saving.</li>
            </ul>
            <button onClick={() => setGuestWelcomeOpen(false)} className="mt-6 w-full rounded-xl bg-emerald-300 px-4 py-3 font-black text-emerald-950 hover:bg-emerald-200">Start testing</button>
          </div>
        </div>
      )}
      {reveal && <RevealModal reveal={reveal} close={() => setReveal(null)} />}
      {capsuleToConfirm && <ConfirmOpenModal
        title={capsuleToConfirm.name}
        description={`Are you sure you want to open ${capsuleToConfirm.name}?`}
        confirmLabel={isGuest ? "Open for free" : `Open for ${capsuleToConfirm.price} tokens`}
        cancel={() => setCapsuleToConfirm(null)}
        confirm={() => {
          const capsule = capsuleToConfirm;
          setCapsuleToConfirm(null);
          openCapsule(capsule);
        }}
      />}
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
          isGuest={isGuest}
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
      {selectedListing && <ListingModal listing={selectedListing} close={() => setSelectedListing(null)} buy={buyListing} isGuest={isGuest} />}
    </main>
  );
}

/* Signup is intentionally kept focused on authentication. */
function SignupBlookPile() {
  const [items, setItems] = useState(() => [
    "Bread Blook", "Astronaut", "Worker", "Mars", "Chef", "Earth", "Star", "Alien", "Caveman", "Blooket Life", "Doctor", "Ninja", "King", "Yeti", "Megabot", "Lion", "Butterfly", "Blackbeard",
  ].map((name, index) => ({ name, x: 5 + (index * 11) % 88, y: -18 - index * 12, velocity: 0.2 + index * 0.03, rotation: (index % 2 ? -1 : 1) * (index * 7), dragging: false })));

  useEffect(() => {
    const timer = window.setInterval(() => {
      setItems((current) => current.map((item, index) => {
        if (item.dragging) return item;
        const nextVelocity = Math.min(1.8, item.velocity + 0.08);
        const nextY = item.y + nextVelocity;
        const floor = 78 - (index % 5) * 4;
        return nextY > floor
          ? { ...item, y: floor, velocity: 0, rotation: item.rotation + 1 }
          : { ...item, y: nextY, velocity: nextVelocity, rotation: item.rotation + nextVelocity * 2 };
      }));
    }, 40);
    return () => window.clearInterval(timer);
  }, []);

  return null;
}

function LoginScreen({
  username,
  email,
  password,
  migrationCode,
  setUsername,
  setEmail,
  setPassword,
  setMigrationCode,
  authMode,
  setAuthMode,
  forgotPassword,
  setForgotPassword,
  login,
  notice,
  closeNotice,
  authFeedback,
  startGuest,
  resetClickCountRef,
  setAuthFeedback,
}: {
  username: string;
  email: string;
  password: string;
  migrationCode: string;
  setUsername: (value: string) => void;
  setEmail: (value: string) => void;
  setPassword: (value: string) => void;
  setMigrationCode: (value: string) => void;
  authMode: "login" | "signup";
  setAuthMode: (value: "login" | "signup") => void;
  forgotPassword: boolean;
  setForgotPassword: (value: boolean) => void;
  login: (event: FormEvent<HTMLFormElement>) => void;
  notice: string;
  closeNotice: () => void;
  authFeedback: string;
  startGuest: () => void;
  resetClickCountRef: { current: number };
  setAuthFeedback: (value: string) => void;
}) {
  return (
    <main className="auth-screen flex min-h-screen items-center justify-center bg-[#0c3b70] px-5 text-white">
      <form
        onSubmit={login}
        className="w-full max-w-md rounded-3xl border border-[#3d91cd] bg-[#103f75] p-8 shadow-2xl"
      >
        <img
          src="/assets/breadlet-logo.svg"
          alt="Breadlet logo"
          className="mx-auto mb-8 h-32 w-80 object-contain"
        />
        <h1 className="text-center text-3xl font-black">
          {forgotPassword ? "Reset your password" : authMode === "login" ? "Welcome back" : "Start your collection"}
        </h1>
        <p className="mt-3 text-center text-sm leading-6 text-[#bde8ff]">
          {forgotPassword ? "Enter your username and we will email a reset link." : authMode === "login" ? "Log in to continue your collection." : "Create your account and enter the game."}
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
          className="mt-2 w-full rounded-xl bg-[#0c3b70] px-4 py-3 text-white outline-none focus:border-[#73c8ff]"
        />
        {!forgotPassword && authMode === "signup" && <label
          className="mt-5 block text-xs font-bold uppercase tracking-widest text-[#eac477]"
          htmlFor="email"
        >
          Email <span className="normal-case tracking-normal text-white/50">(optional)</span>
        </label>}
        {!forgotPassword && authMode === "signup" && <input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Skip to use username login only"
          className="mt-2 w-full rounded-xl bg-[#0c3b70] px-4 py-3 text-white outline-none focus:border-[#73c8ff]"
        />}
        {!forgotPassword && authMode === "signup" && <p className="mt-1 text-xs text-white/55">Without email, you can’t receive password reset links.</p>}
        {!forgotPassword && <label
          className="mt-5 block text-xs font-bold uppercase tracking-widest text-[#eac477]"
          htmlFor="password"
        >
          Password
        </label>}
        {!forgotPassword && <input
          id="password"
          required
          minLength={4}
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Create a password"
          className="mt-2 w-full rounded-xl bg-[#0c3b70] px-4 py-3 text-white outline-none focus:border-[#73c8ff]"
        />}
        {authMode === "signup" && <label className="mt-5 block text-xs font-bold uppercase tracking-widest text-[#bde8ff]" htmlFor="migration-code">
          Do you have a Breadlet migration code?
        </label>}
        {authMode === "signup" && <input
          id="migration-code"
          value={migrationCode}
          onChange={(event) => setMigrationCode(event.target.value)}
          placeholder="Optional migration code"
          className="mt-2 w-full rounded-xl bg-[#072a54] px-4 py-3 text-white outline-none"
        />}
        {notice && (
          <div className="modal-layer fixed inset-0 z-[9999] flex min-h-screen items-center justify-center bg-black/55 px-5 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl border border-[#73c8ff] bg-[#18558f] p-6 text-center shadow-2xl">
              <p className="text-lg font-black text-[#bde8ff]">Breadlet update</p>
              <p className="mt-3 text-sm text-[#d9f3ff]">{notice}</p>
              <button onClick={closeNotice} className="mt-5 w-full rounded-xl bg-[#39a8f5] px-4 py-3 font-black text-[#031426]">Close</button>
            </div>
          </div>
        )}
        <button type="submit" className="mt-6 w-full rounded-xl bg-[#e9bd67] px-4 py-3 font-black text-[#29170c] hover:bg-[#ffe2a0]">
          {forgotPassword ? "Email reset link" : authMode === "login" ? "Log in" : "Create account"}
        </button>
        {authFeedback && <p role="status" className="mt-3 text-center text-xs leading-5 text-emerald-200">{authFeedback}</p>}
        {authMode === "login" && !forgotPassword && <button type="button" onClick={() => { resetClickCountRef.current = 0; setAuthFeedback(""); setForgotPassword(true); }} className="mt-3 w-full text-sm font-bold text-[#bde8ff]">Forgot password?</button>}
        {forgotPassword && <button type="button" onClick={() => { resetClickCountRef.current = 0; setAuthFeedback(""); setForgotPassword(false); }} className="mt-3 w-full text-sm font-bold text-[#bde8ff]">Back to log in</button>}
        {!forgotPassword && authMode === "login" && <button type="button" onClick={startGuest} className="mt-4 w-full rounded-xl border border-emerald-300/50 bg-emerald-300/10 px-4 py-3 font-black text-emerald-100 hover:bg-emerald-300/20">Play as guest · free</button>}
        {!forgotPassword && <button type="button" onClick={() => setAuthMode(authMode === "login" ? "signup" : "login")} className="mt-3 w-full text-sm font-bold text-[#bde8ff]">
          {authMode === "login" ? "Need an account? Sign up" : "Already have an account? Log in"}
        </button>}
      </form>
    </main>
  );
}

function ProfileTab({
  player,
  setTab,
  showBadge,
  savePlayer,
  addFriend,
  isGuest,
}: {
  player: Player;
  setTab: (tab: Tab) => void;
  showBadge: (badge: string) => void;
  savePlayer: (player: Player) => void;
  addFriend: (username: string) => void;
  isGuest: boolean;
}) {
  const [lookup, setLookup] = useState("");
  const [matches, setMatches] = useState<{ id: string; username: string }[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [tradeTarget, setTradeTarget] = useState<{ id?: string; username: string; tradeId?: string; offer?: any } | null>(null);
  const [tradeTokens, setTradeTokens] = useState("0");
  const [tradeBlooks, setTradeBlooks] = useState<Record<string, number>>({});
  const [tradeMessage, setTradeMessage] = useState("");
  const [tradeBusy, setTradeBusy] = useState(false);
  const foundUser = lookup.trim() && lookup.trim().toLowerCase() !== player.username.toLowerCase() ? lookup.trim() : "";

  const loadTrades = useCallback(async () => {
    if (isGuest) return;
    const response = await fetch("/api/trades", { cache: "no-store" });
    if (response.ok) setTrades(await response.json());
  }, [isGuest]);

  useEffect(() => {
    if (isGuest) return;
    void loadTrades();
    const interval = window.setInterval(() => void loadTrades(), 15000);
    return () => window.clearInterval(interval);
  }, [isGuest, loadTrades]);

  const searchPlayers = async () => {
    if (lookup.trim().length < 2) return;
    const response = await fetch(`/api/players/search?q=${encodeURIComponent(lookup.trim())}`);
    if (response.ok) setMatches(await response.json());
  };

  const saveTradeOffer = async () => {
    if (!tradeTarget) return;
    setTradeBusy(true);
    setTradeMessage("");
    const offer = {
      tokens: Math.max(0, Math.floor(Number(tradeTokens) || 0)),
      blooks: Object.entries(tradeBlooks).filter(([, quantity]) => quantity > 0).map(([name, quantity]) => ({ name, quantity })),
    };
    const response = await fetch("/api/trades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tradeTarget.tradeId
        ? { action: "offer", tradeId: tradeTarget.tradeId, offer }
        : { action: "create", receiverUsername: tradeTarget.username, offer }),
    });
    const result = await response.json().catch(() => ({}));
    setTradeBusy(false);
    if (!response.ok) {
      setTradeMessage(result.error || "Could not send the trade offer.");
      return;
    }
    setTradeTarget(null);
    await loadTrades();
  };

  const respondToTrade = async (tradeId: string, action: string) => {
    const response = await fetch("/api/trades", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tradeId, action }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) setTradeMessage(result.error || "Trade action failed.");
    await loadTrades();
  };

  const uniqueBlooks = player.inventory.reduce<{ name: string; quantity: number }[]>((items, name) => {
    const existing = items.find((item) => item.name === name);
    if (existing) existing.quantity += 1;
    else items.push({ name, quantity: 1 });
    return items;
  }, []);
  const offerSummary = (offer: any) => {
    const blooks = Array.isArray(offer?.blooks) ? offer.blooks : [];
    const tokens = Number(offer?.tokens) || 0;
    return [tokens ? `${tokens.toLocaleString()} tokens` : "", ...blooks.map((item: any) => `${item.name} ×${item.quantity}`)].filter(Boolean).join(" · ") || "No items or tokens offered";
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="profile-hero rounded-3xl border border-[#73c8ff]/45 bg-gradient-to-br from-[#58b8f2] to-[#1677bd] p-7">
        <div className="flex flex-wrap items-center gap-5">
          <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-2xl border border-white/50 bg-[#bde8ff] p-0">
            {player.equipped ? <img
              src={artFor(player.equipped)}
              alt={player.equipped}
              className="h-full w-full object-cover"
            /> : <CircleUserRound size={48} className="text-[#17659c]" />}
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#ffe2a0]">
              Player profile
            </p>
            <h1 className="mt-2 text-4xl font-black">
              {player.username} {player.clanTag && <span className="text-[#ffe2a0]">[{player.clanTag}]</span>}
            </h1>
            {player.equipped && <p className="mt-1 text-xs font-bold uppercase tracking-widest text-[#eac477]">
              {rarityFor(player.equipped)}
            </p>}
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
        <div className="mt-4 flex gap-2"><input value={lookup} onChange={(event) => setLookup(event.target.value)} placeholder="Search username" className="min-w-0 flex-1 rounded-xl border border-[#3d91cd] bg-[#103f75] px-3 py-3 text-white" /><button onClick={searchPlayers} className="rounded-xl bg-[#39a8f5] px-4 py-3 font-black text-[#031426]">Search</button></div>
        {!!matches.length && <div className="mt-4 space-y-2">{matches.map((match) => <div key={match.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#103f75] p-3"><span className="font-black">{match.username}</span><div className="flex gap-2"><button onClick={() => addFriend(match.username)} className="rounded-lg border border-[#3d91cd] px-3 py-2 text-sm font-bold text-[#bde8ff]">Add friend</button><button disabled={isGuest} onClick={() => { setTradeTarget({ id: match.id, username: match.username }); setTradeTokens("0"); setTradeBlooks({}); }} className="rounded-lg bg-emerald-300 px-3 py-2 text-sm font-black text-emerald-950 disabled:opacity-40">Trade</button></div></div>)}</div>}
        {!!player.friends?.length && <p className="mt-4 text-sm text-[#d9f3ff]">Friends: {player.friends.join(", ")}</p>}
      </div>
      {!isGuest && <div className="rounded-3xl border border-emerald-300/30 bg-[#143528] p-6 lg:col-span-2">
        <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-widest text-emerald-200">Player-to-player</p><h2 className="mt-1 text-2xl font-black">Trade inbox</h2></div><button onClick={() => void loadTrades()} className="rounded-lg border border-emerald-100/20 px-3 py-2 text-sm font-bold text-emerald-100">Refresh</button></div>
        {tradeMessage && <p role="status" className="mt-3 text-sm text-amber-200">{tradeMessage}</p>}
        <div className="mt-4 space-y-3">{trades.filter((trade) => trade.status === "pending").map((trade) => {
          const sentByMe = trade.sender_profile_id === player.id;
          const otherName = sentByMe ? trade.receiver_username : trade.sender_username;
          const myOffer = sentByMe ? trade.sender_offer_json : trade.receiver_offer_json;
          const theirOffer = sentByMe ? trade.receiver_offer_json : trade.sender_offer_json;
          const confirmed = sentByMe ? trade.sender_confirmed : trade.receiver_confirmed;
          return <article key={trade.id} className="rounded-xl border border-emerald-100/15 bg-black/15 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-black text-white">Trade with {otherName}</p><p className="mt-1 text-xs text-white/55">{sentByMe ? "Outgoing offer" : "Incoming offer"} · {new Date(trade.updated_at).toLocaleString()}</p></div><span className="rounded-full bg-amber-200/10 px-3 py-1 text-xs font-black text-amber-100">{confirmed ? "You confirmed" : "Needs confirmation"}</span></div>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><p className="rounded-lg bg-black/20 p-3"><b>Your side:</b> {offerSummary(myOffer)}</p><p className="rounded-lg bg-black/20 p-3"><b>Their side:</b> {offerSummary(theirOffer)}</p></div>
            <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => { setTradeTarget({ username: otherName, tradeId: trade.id }); setTradeTokens(String(Number(myOffer?.tokens) || 0)); setTradeBlooks(Object.fromEntries((myOffer?.blooks || []).map((item: any) => [item.name, item.quantity]))); }} className="rounded-lg border border-emerald-100/20 px-3 py-2 text-sm font-bold text-emerald-100">Edit your offer</button><button onClick={() => void respondToTrade(trade.id, "confirm")} className="rounded-lg bg-emerald-300 px-3 py-2 text-sm font-black text-emerald-950">{confirmed ? "Confirm again" : "Confirm trade"}</button><button onClick={() => void respondToTrade(trade.id, sentByMe ? "cancel" : "decline")} className="rounded-lg border border-rose-300/30 px-3 py-2 text-sm font-bold text-rose-200">{sentByMe ? "Cancel" : "Decline"}</button></div>
          </article>;
        })}{!trades.some((trade) => trade.status === "pending") && <p className="rounded-xl bg-black/15 p-4 text-sm text-emerald-50/65">No pending trades. Search for a player above to send an offer.</p>}</div>
      </div>}
      <div className="flex flex-wrap gap-3 rounded-2xl border border-[#73c8ff]/45 bg-[#18558f] p-4">
        <button onClick={() => setTab("promo")} className="rounded-lg border border-[#3d91cd] px-4 py-2 font-bold text-[#bde8ff]">Promo Codes</button>
        <button onClick={() => setTab("info")} className="rounded-lg border border-[#3d91cd] px-4 py-2 font-bold text-[#bde8ff]">Info & Tutorial</button>
      </div>
      {tradeTarget && <TradeOfferModal
        targetName={tradeTarget.username}
        ownBlooks={uniqueBlooks}
        tokens={player.tokens}
        tokenValue={tradeTokens}
        setTokenValue={setTradeTokens}
        blookQuantities={tradeBlooks}
        setBlookQuantities={setTradeBlooks}
        busy={tradeBusy}
        message={tradeMessage}
        close={() => setTradeTarget(null)}
        submit={() => void saveTradeOffer()}
      />}
    </div>
  );
}

function TradeOfferModal({
  targetName,
  ownBlooks,
  tokens,
  tokenValue,
  setTokenValue,
  blookQuantities,
  setBlookQuantities,
  busy,
  message,
  close,
  submit,
}: {
  targetName: string;
  ownBlooks: { name: string; quantity: number }[];
  tokens: number;
  tokenValue: string;
  setTokenValue: (value: string) => void;
  blookQuantities: Record<string, number>;
  setBlookQuantities: (value: Record<string, number>) => void;
  busy: boolean;
  message: string;
  close: () => void;
  submit: () => void;
}) {
  return <div className="modal-layer fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-black/80 px-4 py-6 backdrop-blur-sm">
    <section role="dialog" aria-modal="true" aria-labelledby="trade-offer-title" className="w-full max-w-lg rounded-2xl border border-emerald-200/30 bg-[#10251f] p-5 text-white shadow-2xl sm:p-6">
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-200">Trade offer</p><h2 id="trade-offer-title" className="mt-1 text-2xl font-black">Trading with {targetName}</h2></div><button onClick={close} aria-label="Close trade offer" className="rounded-lg px-3 py-2 text-xl text-white/60 hover:bg-white/10">×</button></div>
      <label className="mt-5 block text-sm font-bold">Tokens to offer (you have {tokens.toLocaleString()})<input type="number" min="0" max={tokens} value={tokenValue} onChange={(event) => setTokenValue(event.target.value)} className="mt-2 w-full rounded-xl border border-emerald-100/15 bg-black/20 px-3 py-3 text-white" /></label>
      <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">{ownBlooks.map(({ name, quantity }) => {
        return <label key={name} className="flex items-center justify-between gap-3 rounded-xl bg-black/20 px-3 py-2"><span className="min-w-0 truncate text-sm font-bold">{name} <small className="text-white/50">×{quantity}</small></span><input aria-label={`${name} quantity`} type="number" min="0" max={quantity} value={blookQuantities[name] || 0} onChange={(event) => setBlookQuantities({ ...blookQuantities, [name]: Math.max(0, Math.min(quantity, Number(event.target.value) || 0)) })} className="w-20 rounded-lg border border-emerald-100/15 bg-[#10251f] px-2 py-2 text-center text-white" /></label>;
      })}{!ownBlooks.length && <p className="rounded-xl bg-black/20 p-4 text-sm text-white/60">Your collection is empty.</p>}</div>
      {message && <p role="alert" className="mt-3 text-sm text-rose-200">{message}</p>}
      <div className="mt-5 grid grid-cols-2 gap-3"><button onClick={close} className="rounded-xl border border-white/15 px-4 py-3 font-bold text-white/75 hover:bg-white/10">Cancel</button><button disabled={busy} onClick={submit} className="rounded-xl bg-emerald-300 px-4 py-3 font-black text-emerald-950 disabled:opacity-50">{busy ? "Sending..." : "Send offer"}</button></div>
    </section>
  </div>;
}

function rarityFor(name: string) {
  const baseName = name.replace(/^Shiny /, "");
  const craftedRarity = craftedRarityFor(baseName);
  if (craftRecipes.some((recipe) => recipe.name === baseName)) return craftedRarity;
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
  isGuest,
}: {
  showRetired: boolean;
  setShowRetired: (value: boolean) => void;
  openCapsule: (capsule: Capsule) => void;
  showOdds: (capsule: Capsule) => void;
  openMass: () => void;
  playerTokens: number;
  isGuest: boolean;
}) {
  const capsules = isGuest || showRetired
    ? [...liveCapsules, ...retiredCapsules]
    : liveCapsules;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-4xl font-black">Capsules</h1>
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
          {isGuest ? "Guest test mode: retired boxes are openable for free." : "Retired boxes are visual-only and can come back at any time."}
        </div>
      )}
      <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {capsules.map((capsule) => (
          <div
            key={capsule.name}
            onClick={() => (!capsule.retired || isGuest) && openCapsule(capsule)}
            className={`group rounded-2xl p-6 transition hover:-translate-y-1 ${
              capsule.retired ? "bg-[#302016] opacity-80" : "border border-[#d49a4a]/25 bg-[#3a2415]"
            } ${!capsule.retired || isGuest ? "cursor-pointer" : ""}`}
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
              </div>
              <button
                title="View Blook chances"
                onClick={() => showOdds(capsule)}
                className="rounded-full px-2 py-1 text-xs font-black text-[#ffe2a0]"
              >
                i
              </button>
            </div>
            {(!capsule.retired || isGuest) && (
              <>
                <div className="mt-4 flex items-center justify-between border-y border-white/10 py-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-white/60">{capsule.retired ? "Retired crate · open capsule" : "Open capsule"}</span>
                  <span className="flex items-center gap-2 text-lg font-black text-[#ffe27a]">
                    <img src="/assets/coin.svg" alt="" className="h-6 w-6 object-contain" />
                    {isGuest ? "FREE" : capsule.price.toLocaleString()}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {capsule.pool.map((reward) => (
                    <div key={reward.name} className={`flex min-w-0 items-center gap-2 rounded-lg border px-2 py-2 ${rarityTileClass(reward.rarity)}`}>
                      <img src={reward.art || artFor(reward.name)} alt="" className="h-8 w-8 shrink-0 object-contain" />
                      <span className="min-w-0 flex-1 truncate text-left text-xs font-bold">{reward.name}</span>
                      <span className="shrink-0 text-[10px] font-black">{chanceFor(capsule, reward).toFixed(2)}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            {capsule.note && (
              <p className="mt-3 text-xs font-bold uppercase tracking-widest text-[#ffe2a0]">
                {capsule.note}
              </p>
            )}
            {capsule.retired && <p className="mt-5 text-center text-xs font-bold uppercase text-[#9cc8e8]">Retired</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function StarShipFrameSwitcher({ className }: { className: string }) {
  const [frame, setFrame] = useState(1);
  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((f) => (f % 7) + 1);
    }, 150);
    return () => clearInterval(timer);
  }, []);
  return (
    <img
      src={`/assets/star ship frame ${frame}.svg`}
      alt="Star Ship"
      className={`max-h-full max-w-full object-contain ${className}`}
    />
  );
}

function RewardArt({ name, art, className }: { name: string; art: string; className: string }) {
  const cleanName = name.replace(/^Shiny /, "");
  if (cleanName === "Star Ship") {
    return <StarShipFrameSwitcher className={className} />;
  }
  if (cleanName === "Timeglass") {
    return <span className={`timeglass-sequence relative inline-flex h-full w-full items-center justify-center ${className}`}>{["/assets/Time glass first animation.svg", "/assets/Time glass second animation2.svg", "/assets/Time glass 3rd animation3.svg", "/assets/Time glass final animation.svg"].map((frame, index) => <img key={frame} src={frame} alt={name} className={`timeglass-frame timeglass-frame-${index} max-h-full max-w-full object-contain`} />)}</span>;
  }
  return (
    <span className={`relative inline-flex items-center justify-center ${className}`}>
      <img src={art} alt={name} className="max-h-full max-w-full object-contain" />
      {cleanName === "Caveman" && <img src="/assets/rock for caveman to throw.svg" alt="" className="caveman-accessory caveman-rock absolute bottom-0 right-0 h-1/3 w-1/3 object-contain" />}
      {cleanName === "Alien" && <img src="/assets/lar blaster (for alien).svg" alt="" className="alien-accessory alien-laser absolute bottom-0 right-0 h-1/2 w-1/2 object-contain" />}
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
  const [showPacks, setShowPacks] = useState(true);

  const owned = (name: string) =>
    player.inventory.filter((item) => item === name).length;

  const catalog = [...liveCapsules, ...retiredCapsules].map((capsule) => {
    const shinyRewards = capsule.pool
      .filter((reward) => shinyEligibleNames.has(reward.name))
      .map((reward) => ({ ...reward, name: `Shiny ${reward.name}` }));
    return { ...capsule, pool: [...capsule.pool, ...shinyRewards] };
  });

  return (
    <div className="flex flex-col lg:flex-row gap-8 items-start">
      {/* Main Blooks Grid Area */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#3d91cd]/30">
          <div>
            <h1 className="text-4xl font-black text-white tracking-wide">My Blooks</h1>
            <p className="mt-1 text-sm text-[#9cc8e8]">Click any Blook to view details, equip, or sell.</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-[#103f75] px-3.5 py-2 text-xs font-bold text-[#bde8ff] border border-[#3d91cd]/40">
              <input
                type="checkbox"
                checked={showPacks}
                onChange={(e) => setShowPacks(e.target.checked)}
                className="h-4 w-4 accent-[#39a8f5]"
              />
              Show retired boxes
            </label>
          </div>
        </div>

        <div className="mt-6 space-y-8">
          {catalog.map((capsule) => (
            <section key={capsule.name} className="rounded-3xl border border-[#3d91cd]/30 bg-[#103f75]/80 p-5 shadow-md">
              <div className="mb-4 flex items-center justify-between border-b border-[#3d91cd]/20 pb-2">
                <h2 className="text-xl font-black text-[#bde8ff] flex items-center gap-2">
                  <img src={capsule.art} alt="" className="h-6 w-6 object-contain" />
                  {capsule.name}
                </h2>
                {capsule.retired && (
                  <span className="rounded-full bg-[#0c3b70] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#e9bd67] border border-[#e9bd67]/30">
                    Retired
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {capsule.pool.map((reward) => {
                  const quantity = owned(reward.name);
                  return (
                    <button
                      key={reward.name}
                      title={quantity ? `${reward.name} (x${quantity})` : `${reward.name} (Locked)`}
                      onClick={() => quantity && setSelected(reward)}
                        className={`relative flex aspect-square flex-col items-center justify-center transition-all p-0 ${
                        quantity
                          ? "cursor-pointer hover:-translate-y-1"
                          : "opacity-60 cursor-not-allowed"
                      }`}
                    >
                      {quantity ? (
                        <RewardArt
                          name={reward.name}
                          art={artFor(reward.name)}
                          className={`h-full w-full ${rewardEffectClassFor(reward.name, reward.rarity)}`}
                        />
                      ) : (
                        <div className="relative flex h-full w-full items-center justify-center">
                          <span className="h-full w-full rounded-xl bg-black/80" />
                          <Lock size={16} className="absolute text-white/80" />
                        </div>
                      )}

                      {/* Quantity badge */}
                      {quantity > 0 && (
                        <span className="absolute bottom-1.5 left-1.5 rounded-lg bg-[#22c55e] px-1.5 py-0.5 text-[10px] font-black text-white shadow">
                          {quantity}
                        </span>
                      )}

                      {/* Equipped badge */}
                      {player.equipped === reward.name && (
                        <span className="absolute top-1.5 right-1.5 rounded-md bg-[#e9bd67] px-1 text-[9px] font-black text-[#031426]">
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
          <section className="rounded-3xl border border-[#d9a9ff]/35 bg-[#27213d]/80 p-5 shadow-md">
            <div className="mb-4 flex items-center justify-between border-b border-[#d9a9ff]/20 pb-2">
              <h2 className="text-xl font-black text-[#ead4ff]">Crafted</h2>
              <span className="text-xs font-bold uppercase tracking-widest text-[#c9a8e8]">Craft-only Blooks</span>
            </div>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
              {craftRecipes.map((recipe) => {
                const reward: Reward = { name: recipe.name, rarity: craftedRarityFor(recipe.name), weight: 0, art: artFor(recipe.name) };
                const quantity = owned(recipe.name);
                return <button
                  key={recipe.name}
                  title={quantity ? `${recipe.name} · ${reward.rarity} (x${quantity})` : `${recipe.name} · ${reward.rarity} (Locked)`}
                  onClick={() => quantity && setSelected(reward)}
                  className={`relative flex aspect-square flex-col items-center justify-center p-2 transition ${quantity ? "hover:-translate-y-1" : "cursor-not-allowed opacity-55"}`}
                >
                  {quantity ? <RewardArt name={recipe.name} art={reward.art || artFor(recipe.name)} className={`h-full w-full ${rewardEffectClassFor(recipe.name, reward.rarity)}`} /> : <div className="relative flex h-full w-full items-center justify-center"><span className="h-full w-full rounded-xl bg-black/80" /><Lock size={16} className="absolute text-white/80" /></div>}
                  <span className={`absolute bottom-1 left-1 rounded-md px-1.5 py-0.5 text-[9px] font-black ${reward.rarity === "Mythic" ? "bg-fuchsia-300 text-slate-950" : "bg-amber-300 text-slate-950"}`}>{reward.rarity}</span>
                  {quantity > 0 && <span className="absolute bottom-1 right-1 rounded-lg bg-emerald-500 px-1.5 py-0.5 text-[10px] font-black text-white">{quantity}</span>}
                  {player.equipped === recipe.name && <span className="absolute right-1 top-1 rounded-md bg-amber-300 px-1 text-[9px] font-black text-slate-950">✓</span>}
                </button>;
              })}
            </div>
          </section>
        </div>
      </div>

      {/* Selected Blook Detail Modal */}
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
    <div className="modal-layer fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 px-5 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl border border-[#3d91cd] bg-[#103f75] p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[#bde8ff]">
              Blook details
            </p>
            <h2 className="mt-1 text-2xl font-black text-white">{reward.name}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl bg-[#18558f] px-3 py-1.5 text-sm font-bold text-[#bde8ff] hover:bg-[#24649c]"
          >
            Close
          </button>
        </div>
        <div className="mt-5 flex h-64 items-center justify-center bg-transparent p-0">
          <RewardArt name={reward.name} art={artFor(reward.name)} className={`h-full w-full scale-125 ${rewardEffectClassFor(reward.name, reward.rarity)}`} />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Stat label="Rarity" value={reward.rarity} />
          <Stat label="Quantity" value={String(quantity)} />
          <Stat label="Shiny" value={shinyEligibleNames.has(reward.name.replace(/^Shiny /, "")) ? "Eligible · 1/100" : "Not eligible"} />
          <Stat
            label="Sell value"
            value={`${sellValueFor(reward.rarity)} tokens`}
          />
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            disabled={!quantity || equipped}
            onClick={() => {
              equip(reward.name);
              onClose();
            }}
            className="rounded-xl bg-[#39a8f5] px-4 py-3 text-sm font-black text-[#031426] hover:bg-[#73c8ff] disabled:opacity-40"
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
            className="rounded-xl border border-red-400 bg-red-900/30 px-4 py-3 text-sm font-bold text-red-200 hover:bg-red-900/50 disabled:opacity-40"
          >
            Sell
          </button>
        </div>
      </div>
    </div>
  );
}

function RewardBurst({ rarity }: { rarity: string }) {
  const palettes: Record<string, string[]> = {
    Common: ["#d1d5db", "#ffffff"],
    Uncommon: ["#34d399", "#a7f3d0", "#ffffff"],
    Rare: ["#38bdf8", "#bae6fd", "#ffffff"],
    Epic: ["#c084fc", "#e9d5ff", "#ffffff"],
    Legendary: ["#fbbf24", "#fde68a", "#fff7ed"],
    Mythic: ["#fb7185", "#fda4af", "#fef2f2"],
    Unique: ["#e879f9", "#f5d0fe", "#ffffff"],
    Transcendent: ["#facc15", "#f0abfc", "#67e8f9", "#ffffff"],
  };
  const counts: Record<string, number> = { Common: 12, Uncommon: 16, Rare: 20, Epic: 24, Legendary: 28, Mythic: 32, Unique: 36, Transcendent: 40 };
  const colors = palettes[rarity] || palettes.Common;
  const count = counts[rarity] || counts.Common;
  const distance = 64 + Object.keys(counts).indexOf(rarity) * 24;
  return (
    <span className="reward-burst" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <i
          key={index}
          className={`reward-particle reward-particle-${index % 3}`}
          style={{
            "--burst-angle": `${(index * 360) / count}deg`,
            "--burst-color": colors[index % colors.length],
            "--burst-distance": `${distance + (index % 4) * 10}px`,
          } as React.CSSProperties}
        />
      ))}
    </span>
  );
}

function ConfirmOpenModal({
  title,
  description,
  confirmLabel,
  confirm,
  cancel,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  confirm: () => void;
  cancel: () => void;
}) {
  return (
    <div className="modal-layer fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 px-5 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" aria-labelledby="confirm-open-title" className="w-full max-w-sm rounded-2xl border border-sky-300/35 bg-[#10182b] p-6 text-white shadow-2xl">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-sky-300">Confirm opening</p>
        <h2 id="confirm-open-title" className="mt-2 text-2xl font-black">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-white/70">{description}</p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button onClick={cancel} className="rounded-xl border border-white/15 px-4 py-3 font-bold text-white/75 hover:bg-white/10">Cancel</button>
          <button onClick={confirm} className="rounded-xl bg-amber-300 px-4 py-3 font-black text-slate-950 hover:bg-amber-200">{confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}

function WheelTab({
  player,
  spin,
  isGuest,
}: {
  player: Player;
  spin: (reward: (typeof wheelRewards)[number]) => void;
  isGuest: boolean;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [oddsOpen, setOddsOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [phase, setPhase] = useState<"ready" | "spinning" | "result">("ready");
  const [charging, setCharging] = useState(false);
  const [result, setResult] = useState<(typeof wheelRewards)[number] | null>(null);
  const [track, setTrack] = useState<(typeof wheelRewards)[number][]>(() =>
    Array.from({ length: 36 }, () => wheelRewards[Math.floor(Math.random() * wheelRewards.length)]),
  );
  const [beltOffset, setBeltOffset] = useState(0);
  const winnerIndex = 28;
  const performSpin = () => {
    if (phase === "spinning" || (player.wheelSpun && !isGuest)) return;
    setCharging(true);
    window.setTimeout(() => setCharging(false), 900);
    setResult(null);
    setBeltOffset(0);
    const totalChance = wheelRewards.reduce((sum, item) => sum + item.chance, 0);
    const roll = Math.random() * totalChance;
    let cursor = 0;
    const reward = wheelRewards.find((item) => {
      cursor += item.chance;
      return roll < cursor;
    }) || wheelRewards[0];
    setTrack(Array.from({ length: 36 }, (_, index) =>
      index === winnerIndex
        ? reward
        : wheelRewards[Math.floor(Math.random() * wheelRewards.length)],
    ));
    setPhase("spinning");
    window.setTimeout(() => {
      const viewport = viewportRef.current;
      if (viewport) setBeltOffset(viewport.clientWidth / 2 - winnerIndex * 120 - 56);
    }, 80);
    window.setTimeout(() => {
      setResult(reward);
      setPhase("result");
      spin(reward);
    }, 4800);
  };
  const spinNow = () => {
    if (phase === "spinning" || (player.wheelSpun && !isGuest)) return;
    setConfirmOpen(true);
  };
  const resultIcon = result?.type === "tokens"
    ? "/assets/coin.svg"
    : materialArtFor(result?.material || "Gold");
  return (
    <div className="max-w-6xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#bde8ff]">{isGuest ? "Guest crate · unlimited free opens" : "Daily crate · 1 free opening"}</p>
          <h1 className="mt-2 text-4xl font-black">Daily Crate</h1>
        </div>
        <button type="button" onClick={() => setOddsOpen(true)} aria-label="View possible prizes and chances" title="Possible prizes and chances" className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-sky-300/50 bg-[#10182b] text-lg font-black text-sky-200 shadow-lg transition hover:bg-sky-300 hover:text-slate-950">i</button>
      </div>
      <div className="mt-5">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#10182b] p-4 text-center shadow-xl sm:p-6">
          <div className={`crate-display ${phase === "spinning" ? "crate-opening" : charging ? "reveal-crate-charge" : ""}`}>
            <img src="/assets/crate%20(1).svg" alt="Daily reward crate" className="h-40 w-40 object-contain drop-shadow-2xl sm:h-48 sm:w-48" />
          </div>
          <div ref={viewportRef} className={`roulette-viewport relative mt-2 h-28 overflow-hidden border-y border-white/10 bg-[#090e1b] sm:h-36 ${charging ? "roulette-charge" : phase === "result" ? "roulette-win-flash" : ""}`}>
            <div className="roulette-pointer" />
            {charging ? <div className="absolute inset-0 flex items-center justify-center"><span className="reveal-scanline" /><span className="relative z-10 text-sm font-black uppercase tracking-[0.28em] text-sky-100">Crate charging...</span></div> : phase === "spinning" ? <div className="roulette-belt" style={{ transform: `translateX(${beltOffset}px)`, transitionDuration: "4.55s" }}>
              {track.map((reward, index) => {
                const rarity = wheelRarityFor(reward);
                const icon = reward.type === "tokens" ? "/assets/coin.svg" : materialArtFor(reward.material || "Gold");
                return <div key={`${index}-${reward.label}`} className={`roulette-prize ${rarityTileClass(rarity)}`}>
                  <img src={icon} alt="" className="h-9 w-9 object-contain sm:h-10 sm:w-10" />
                  <span className="max-w-full truncate text-[9px] font-black sm:text-[10px]">{reward.type === "tokens" ? reward.amount.toLocaleString() : `x${reward.amount}`} {reward.type === "tokens" ? "tokens" : reward.material}</span>
                  <span className="text-[8px] font-bold opacity-70">{rarity}</span>
                </div>;
              })}
            </div> : <div className="absolute inset-0 flex items-center justify-center text-xs font-bold uppercase tracking-widest text-white/35">{phase === "result" ? "Reward revealed" : "Your reward appears here"}</div>}
          </div>
          <button onClick={spinNow} disabled={phase === "spinning" || (player.wheelSpun && !isGuest)} className="mt-4 rounded-xl bg-amber-300 px-10 py-3 text-lg font-black text-slate-950 shadow-lg transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50">
            {player.wheelSpun && !isGuest ? "Crate already opened today" : phase === "spinning" ? "Opening crate..." : isGuest ? "Open free crate" : "Open daily crate"}
          </button>
          {result && phase === "result" && (
            <div className="relative mt-5 flex min-h-36 items-center justify-center gap-4 overflow-visible rounded-xl border border-white/10 bg-[#090e1b] p-4">
              <RewardBurst rarity={wheelRarityFor(result)} />
              <img src={resultIcon} alt="" className="reveal-win-slam relative z-10 h-24 w-24 object-contain" />
              <div className="reveal-win-slam relative z-10 text-left">
                <p className="text-[10px] font-black uppercase tracking-widest text-white/50">You won · {wheelRarityFor(result)}</p>
                <p className="text-2xl font-black text-white">{result.type === "tokens" ? `${result.amount.toLocaleString()} tokens` : `${result.amount} ${result.material}`}</p>
              </div>
            </div>
          )}
        </div>
      </div>
      {oddsOpen && <div className="modal-layer fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 px-4 py-6 backdrop-blur-sm">
        <section role="dialog" aria-modal="true" aria-labelledby="crate-odds-title" className="w-full max-w-md rounded-2xl border border-sky-300/30 bg-[#10182b] p-5 text-white shadow-2xl sm:p-6">
          <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
            <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-300">Daily crate</p><h2 id="crate-odds-title" className="mt-1 text-2xl font-black">Possible prizes</h2></div>
            <button onClick={() => setOddsOpen(false)} aria-label="Close prize chances" className="flex h-10 w-10 items-center justify-center rounded-lg text-xl text-white/60 hover:bg-white/10 hover:text-white">×</button>
          </div>
          <div className="mt-4 space-y-2">
            {wheelRewards.map((reward) => {
              const rarity = wheelRarityFor(reward);
              const icon = reward.type === "tokens" ? "/assets/coin.svg" : materialArtFor(reward.material || "Gold");
              return <div key={reward.label} className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${rarityTileClass(rarity)}`}>
                <img src={icon} alt="" className="h-9 w-9 shrink-0 object-contain" />
                <span className="min-w-0 flex-1 truncate text-sm font-bold">{reward.type === "tokens" ? `${reward.amount.toLocaleString()} tokens` : `${reward.amount} ${reward.material}`}</span>
                <span className="text-xs font-black">{reward.chance}%</span>
              </div>;
            })}
          </div>
          <p className="mt-4 flex items-center gap-2 border-t border-white/10 pt-3 text-sm font-bold text-amber-100"><img src="/assets/coin.svg" alt="" className="h-6 w-6" />Balance: {player.tokens.toLocaleString()} tokens</p>
        </section>
      </div>}
      {confirmOpen && <ConfirmOpenModal
        title="Daily Crate"
        description="Are you sure you want to open the Daily Crate?"
        confirmLabel="Open crate"
        cancel={() => setConfirmOpen(false)}
        confirm={() => {
          setConfirmOpen(false);
          performSpin();
        }}
      />}
    </div>
  );
}

function Bazaar({
  player,
  createListing,
  openListing,
  setPlayerListings,
  isGuest,
}: {
  player: Player;
  createListing: (blook: string, price: number) => void;
  openListing: (listing: Listing) => void;
  setPlayerListings?: (listings: Listing[]) => void;
  isGuest: boolean;
}) {
  const [blook, setBlook] = useState(player.inventory[0]);
  const [price, setPrice] = useState("10");
  const [search, setSearch] = useState("");
  const [rarity, setRarity] = useState("All rarities");
  const [showForm, setShowForm] = useState(false);
  const [view, setView] = useState<"browse" | "mine">("browse");
  const [marketListings, setMarketListings] = useState<Listing[]>(player.listings);
  const supabase = useMemo(() => createSupabaseClient(), []);

  const loadListings = useCallback(async () => {
    try {
      const res = await fetch("/api/marketplace", { cache: "no-store" });
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows)) {
          setMarketListings(rows);
          if (setPlayerListings) setPlayerListings(rows);
        }
      }
    } catch {
      // Ignore network errors
    }
  }, [setPlayerListings]);

  useEffect(() => {
    loadListings();
    if (!supabase) return;

    const channel = supabase
      .channel("marketplace-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "marketplace_listings" },
        () => {
          loadListings();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadListings, supabase]);

  useEffect(() => {
    if (player.listings && player.listings.length > 0) {
      setMarketListings(player.listings);
    }
  }, [player.listings]);

  const ownedBlooks = player.inventory.filter(
    (name, index, items) => items.indexOf(name) === index,
  );
  const listings = marketListings.filter((listing) => {
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
            <p className="mt-3 font-black text-[#ffe2a0]">{isGuest ? "FREE" : `${listing.price} tokens`}</p>
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
    track: Reward[];
    winnerIndex: number;
    phase: "charging" | "spinning" | "result";
  };
  close: () => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [beltOffset, setBeltOffset] = useState(0);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || reveal.phase !== "spinning") return;
    const timer = window.setTimeout(() => {
      setBeltOffset(viewport.clientWidth / 2 - reveal.winnerIndex * 120 - 56);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [reveal.phase, reveal.winnerIndex]);

  return (
    <div className="modal-layer fixed inset-0 z-[9999] flex min-h-screen items-center justify-center overflow-y-auto bg-[#050916]/90 px-4 py-6 backdrop-blur-md">
      <div className="w-full max-w-6xl rounded-2xl border border-white/10 bg-[#10182b] p-4 text-center shadow-2xl sm:p-7">
        <div className="flex items-center justify-between gap-4 text-left">
          <div className="flex min-w-0 items-center gap-3">
            <img src={reveal.capsule.art} alt="" className={`h-14 w-14 object-contain ${reveal.phase === "charging" ? "reveal-crate-charge" : reveal.phase === "spinning" ? "reveal-crate-rattle" : ""}`} />
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-sky-300">{reveal.phase === "result" ? "Crate opened" : reveal.phase === "charging" ? "Crate energy building" : "Opening crate"}</p>
              <h2 className="truncate text-xl font-black text-white sm:text-2xl">{reveal.capsule.name}</h2>
            </div>
          </div>
          {reveal.phase === "result" && <button onClick={close} aria-label="Close" className="rounded-lg px-3 py-2 text-xl text-white/60 hover:bg-white/10 hover:text-white">×</button>}
        </div>
        <div ref={viewportRef} className={`roulette-viewport relative mt-6 h-36 overflow-hidden border-y border-white/10 bg-[#090e1b] sm:h-44 ${reveal.phase === "charging" ? "roulette-charge" : reveal.phase === "result" ? "roulette-win-flash" : ""}`}>
          {reveal.phase !== "charging" && <><div className="roulette-pointer" />
          <div className="roulette-belt" style={{ transform: `translateX(${beltOffset}px)`, transitionDuration: reveal.phase === "result" ? "0ms" : "4.55s" }}>
            {reveal.track.map((reward, index) => (
              <div key={`${index}-${reward.name}`} className={`roulette-prize ${rarityTileClass(reward.rarity)}`}>
                <img src={reward.art || artFor(reward.name)} alt="" className="h-16 w-16 object-contain sm:h-20 sm:w-20" />
                <span className="max-w-full truncate text-[10px] font-black sm:text-xs">{reward.name}</span>
                <span className="text-[9px] font-bold opacity-70">{reward.rarity}</span>
              </div>
            ))}
          </div>
          </>}
          {reveal.phase === "charging" && <div className="absolute inset-0 flex items-center justify-center"><span className="reveal-scanline" /><span className="text-sm font-black uppercase tracking-[0.28em] text-sky-100">Locked in...</span></div>}
        </div>
        {reveal.phase !== "result" ? (
          <p className="mt-5 text-sm font-bold text-white/60">{reveal.phase === "charging" ? "Crate is powering up..." : "Good luck. Your reward is on the way..."}</p>
        ) : (
          <div className="relative mt-5 flex flex-col items-center gap-3 overflow-visible rounded-xl border border-white/10 bg-[#090e1b] p-4 sm:flex-row sm:justify-between sm:text-left">
            <RewardBurst rarity={reveal.reward.rarity} />
            <div className="reveal-win-slam relative z-10 flex items-center gap-4">
              <RewardArt name={reveal.reward.name} art={reveal.reward.art || artFor(reveal.reward.name)} className={`h-28 w-28 shrink-0 ${rewardEffectClassFor(reveal.reward.name, reveal.reward.rarity)}`} />
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-white/60">Prize unlocked</p>
                <h1 className="text-3xl font-black text-white">{reveal.reward.name}</h1>
                <p className="mt-1 text-sm font-black text-sky-300">{reveal.reward.rarity} rarity</p>
              </div>
            </div>
            <button onClick={close} className="w-full rounded-xl bg-sky-400 px-6 py-3 font-black text-slate-950 transition hover:bg-sky-300 sm:w-auto">Add to collection</button>
          </div>
        )}
      </div>
    </div>
  );
}
function ListingModal({ listing, close, buy, isGuest }: { listing: Listing; close: () => void; buy: (listing: Listing) => void; isGuest: boolean }) {
  return (
    <div className="modal-layer fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 px-5 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl border border-[#3d91cd] bg-[#103f75] p-6 text-center shadow-2xl">
        <p className="text-xs font-bold uppercase tracking-widest text-[#bde8ff]">Bazaar listing</p>
        <div className="mt-5 flex h-40 items-center justify-center rounded-2xl bg-[#0c3b70] p-4 border border-[#3d91cd]/30">
          <img src={artFor(listing.blook)} alt={listing.blook} className="max-h-full max-w-full object-contain" />
        </div>
        <h2 className="mt-4 text-2xl font-black text-white">{listing.blook}</h2>
        <p className="mt-1 text-sm text-[#9cc8e8]">{rarityFor(listing.blook)} · Seller: {listing.seller}</p>
        <p className="mt-3 text-xl font-black text-[#ffe2a0]">{isGuest ? "FREE" : `${listing.price} tokens`}</p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button onClick={close} className="rounded-xl bg-[#18558f] px-3 py-3 text-sm font-bold text-[#bde8ff] hover:bg-[#24649c]">Close</button>
          <button onClick={() => buy(listing)} className="rounded-xl bg-[#39a8f5] px-3 py-3 text-sm font-black text-[#031426] hover:bg-[#73c8ff]">Buy Blook</button>
        </div>
      </div>
    </div>
  );
}

function OddsModal({
  capsule,
  close,
}: {
  capsule: Capsule;
  close: () => void;
}) {
  return (
    <div className="modal-layer fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 px-5 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-[#3d91cd] bg-[#103f75] p-6 shadow-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-start justify-between gap-4 pb-3 border-b border-[#3d91cd]/30">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[#bde8ff]">
              Specific Blook chances
            </p>
            <h2 className="mt-1 text-2xl font-black text-white">{capsule.name}</h2>
          </div>
          <button
            onClick={close}
            className="rounded-xl bg-[#18558f] px-3 py-1.5 text-sm font-bold text-[#bde8ff] hover:bg-[#24649c]"
          >
            Close
          </button>
        </div>
        <div className="mt-4 space-y-2 overflow-y-auto pr-1 flex-1">
          {capsule.pool.map((reward) => (
            <div
              key={reward.name}
              className="flex items-center justify-between rounded-xl bg-[#0c3b70] p-3 text-sm border border-[#3d91cd]/20"
            >
              <span className="flex min-w-0 items-center gap-3">
                <div className="h-10 w-10 shrink-0 bg-[#072a54] rounded-lg p-1 flex items-center justify-center">
                  <RewardArt name={reward.name} art={reward.art || artFor(reward.name)} className={`h-full w-full ${rewardEffectClassFor(reward.name, reward.rarity)}`} />
                </div>
                <span className="truncate font-bold text-white">{reward.name} <b className="ml-1 text-xs text-[#e9bd67]">{reward.rarity}</b></span>
              </span>
              <b className="text-[#bde8ff] text-base">
                {chanceFor(capsule, reward).toFixed(2)}%
              </b>
            </div>
          ))}
        </div>
        <p className="mt-4 pt-3 border-t border-[#3d91cd]/30 text-xs leading-5 text-[#9cc8e8]">
          Legendary is 0.50% total per pack and Mythic is 0.20% total per pack.
          Opening a capsule only grants its Blook reward; it never creates tokens.
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
  isGuest,
}: {
  quantities: Record<string, number>;
  setQuantity: (name: string, quantity: number) => void;
  close: () => void;
  open: (quantities: Record<string, number>) => void;
  isGuest: boolean;
}) {
  const availableCapsules = isGuest ? [...liveCapsules, ...retiredCapsules] : liveCapsules;
  const total = availableCapsules.reduce(
    (sum, capsule) => sum + (quantities[capsule.name] || 0) * capsule.price,
    0,
  );
  const count = availableCapsules.reduce(
    (sum, capsule) => sum + (quantities[capsule.name] || 0),
    0,
  );
  return (
    <div className="modal-layer fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 px-5 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl border border-[#3d91cd] bg-[#103f75] p-6 shadow-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-start justify-between gap-4 pb-3 border-b border-[#3d91cd]/30">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[#bde8ff]">Batch opening</p>
            <h2 className="mt-1 text-2xl font-black text-white">Mass open capsules</h2>
          </div>
          <button onClick={close} className="rounded-xl bg-[#18558f] px-3 py-1.5 text-sm font-bold text-[#bde8ff] hover:bg-[#24649c]">Close</button>
        </div>
        <div className="mt-4 space-y-3 overflow-y-auto pr-1 flex-1">
          {availableCapsules.map((capsule) => (
            <div key={capsule.name} className="flex items-center gap-3 rounded-2xl bg-[#0c3b70] p-3 border border-[#3d91cd]/20">
              <img src={capsule.art} alt={capsule.name} className="h-12 w-12 object-contain" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-black text-white">{capsule.name}</p>
                <p className="text-xs text-[#9cc8e8]">{isGuest ? "FREE" : `${capsule.price} tokens each`}</p>
              </div>
              <button onClick={() => setQuantity(capsule.name, Math.max(0, (quantities[capsule.name] || 0) - 1))} className="h-9 w-9 rounded-xl bg-[#18558f] text-lg font-black text-white hover:bg-[#24649c]">-</button>
              <input
                type="number"
                min="0"
                max="999"
                value={quantities[capsule.name] || 0}
                onChange={(event) => {
                  const value = Number.parseInt(event.target.value, 10);
                  setQuantity(capsule.name, Number.isFinite(value) ? Math.min(999, Math.max(0, value)) : 0);
                }}
                className="h-9 w-14 rounded-xl bg-[#072a54] text-center font-black text-white outline-none border border-[#3d91cd]/30"
                aria-label={`${capsule.name} quantity`}
              />
              <button onClick={() => setQuantity(capsule.name, (quantities[capsule.name] || 0) + 1)} className="h-9 w-9 rounded-xl bg-[#18558f] text-lg font-black text-white hover:bg-[#24649c]">+</button>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between pt-3 border-t border-[#3d91cd]/30 text-sm font-bold text-white">
          <span>{count} capsule{count === 1 ? "" : "s"}</span>
          <b className="text-lg text-[#ffe2a0]">{isGuest ? "FREE" : `${total.toLocaleString()} tokens`}</b>
        </div>
        <button onClick={() => open(quantities)} className="mt-4 w-full rounded-2xl bg-[#39a8f5] px-4 py-3.5 font-black text-[#031426] text-lg hover:bg-[#73c8ff] shadow-lg transition">Open selected capsules</button>
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
  const groupedResults = results.reduce<{ capsule: string; reward: Reward; count: number }[]>((groups, result) => {
    const existing = groups.find((group) => group.reward.name === result.reward.name && group.reward.rarity === result.reward.rarity);
    if (existing) existing.count += 1;
    else groups.push({ ...result, count: 1 });
    return groups;
  }, []);
  return (
    <div className="modal-layer fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 px-5 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl border border-[#3d91cd] bg-[#103f75] p-6 shadow-2xl max-h-[85vh] flex flex-col text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-[#bde8ff]">Opening complete</p>
        <h2 className="mt-1 text-3xl font-black text-white">Your Blooks</h2>
        <div className="mt-5 grid max-h-[60vh] gap-3 overflow-y-auto sm:grid-cols-2 pr-1">
          {groupedResults.map((result) => (
            <div key={`${result.reward.name}-${result.reward.rarity}`} className="relative flex items-center gap-3 rounded-2xl bg-[#0c3b70] p-3 border border-[#3d91cd]/30">
              <div className="relative h-14 w-14 shrink-0 bg-[#072a54] rounded-xl p-1 flex items-center justify-center">
                <RewardArt name={result.reward.name} art={result.reward.art || artFor(result.reward.name)} className={`h-full w-full ${rewardEffectClassFor(result.reward.name, result.reward.rarity)}`} />
                {result.count > 1 && <span className="absolute -right-2 -top-2 rounded-full border-2 border-[#103f75] bg-amber-300 px-2 py-1 text-xs font-black text-slate-950">×{result.count}</span>}
              </div>
              <div className="min-w-0 text-left">
                <p className="truncate font-black text-white text-base">{result.reward.name}</p>
                <p className="text-xs font-bold text-[#e9bd67]">{result.reward.rarity}{result.count > 1 ? ` · ×${result.count}` : ""}</p>
              </div>
            </div>
          ))}
        </div>
        <button onClick={close} className="mt-6 w-full rounded-2xl bg-[#39a8f5] px-4 py-3.5 font-black text-[#031426] text-lg hover:bg-[#73c8ff] shadow-lg transition">Add to collection</button>
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
  phase: "processing" | "charging" | "output";
  close: () => void;
}) {
  return (
    <div className="modal-layer fixed inset-0 z-[9999] flex min-h-screen items-center justify-center bg-[#031426]/85 px-5 backdrop-blur-sm">
      <div className="craft-machine-modal w-full max-w-xl rounded-3xl border border-[#5dbdff] bg-[#bfe8ff] p-6 text-center text-[#062443] shadow-2xl">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-[#17659c]">Crafting machine</p>
        <h2 className="mt-2 text-3xl font-black">{phase === "processing" ? "Forging your Blook" : phase === "charging" ? "Powering up" : "Craft complete!"}</h2>
          <div className="mt-6 rounded-2xl border-4 border-[#17659c] bg-[#e8f8ff] p-5">
            <img src="/assets/crafting machine.svg" alt="Crafting machine" className="mx-auto mb-4 h-28 w-full object-contain" />
          <div className={`craft-reveal-stage flex min-h-44 items-center justify-center gap-2 overflow-hidden rounded-xl bg-[#8ed2f7] p-4 ${phase === "charging" ? "craft-energy-charge" : phase === "output" ? "craft-output-flash" : ""}`}>
            {phase === "processing" ? (
              <div className="craft-material-stream flex items-center gap-2">
                {bundleEntries(ingredients).map(([material, amount]) => <span key={material} className="craft-input flex items-center rounded-xl bg-white/80 p-2"><img src={materialArtFor(material)} alt={material} className="h-12 w-12 object-contain" /><b className="text-sm">x{amount}</b></span>)}
              </div>
            ) : phase === "charging" ? (
              <div className="craft-energy-core"><span /><span /><span /></div>
            ) : (
              <div className="craft-output-pop relative rounded-2xl bg-white/75 p-5"><RewardBurst rarity={craftedRarityFor(name)} /><RewardArt name={name} art={artFor(name)} className="relative z-10 mx-auto h-36 w-36 object-contain" /><strong className="relative z-10 mt-2 block text-lg">{craftedRarityFor(name)}</strong></div>
            )}
          </div>
          <div className="mx-auto mt-4 flex max-w-sm items-center gap-2"><span className="h-3 flex-1 rounded-full bg-[#17659c]" /><span className="h-10 w-20 rounded-lg border-4 border-[#17659c] bg-[#5dbdff]" /><span className="h-3 flex-1 rounded-full bg-[#17659c]" /></div>
        </div>
        {phase === "output" && <button onClick={close} className="craft-collect mt-6 w-full rounded-xl bg-[#17659c] px-4 py-3 font-black text-white">Collect {name}</button>}
      </div>
    </div>
  );
}
function Leaderboard({ player: _player }: { player: Player }) {
  const [view, setView] = useState<"tokens" | "clans">("tokens");
  const [data, setData] = useState<{ players: { username: string; tokens: number }[]; clans: { name: string; treasury: number }[] }>({ players: [], clans: [] });
  useEffect(() => {
    fetch("/api/leaderboard", { cache: "no-store" }).then(async (response) => {
      if (response.ok) setData(await response.json());
    }).catch(() => undefined);
  }, []);
  const rows = (view === "clans"
    ? data.clans.map((clan) => ({ name: clan.name, value: clan.treasury }))
    : data.players.map((profile) => ({ name: profile.username, value: profile.tokens }))
  ).sort((left, right) => right.value - left.value);
  const podium = [...rows.slice(0, 3), ...Array.from({ length: Math.max(0, 3 - rows.length) }, () => ({ name: "N/A", value: null as number | null }))];
  return (
    <div>
      <h1 className="text-4xl font-black">Leaderboard</h1>
      <div className="mt-6 flex gap-2 rounded-2xl border border-[#247bc0] bg-[#18558f] p-1">{[["tokens", "Tokens"], ["clans", "Clans"]].map(([key, label]) => <button key={key} onClick={() => setView(key as typeof view)} className={`flex-1 rounded-xl px-3 py-3 font-black ${view === key ? "bg-[#bde8ff] text-[#062443]" : "text-[#d9f3ff]"}`}>{label}</button>)}</div>
      {view === "clans" && <p className="mt-3 text-sm text-[#9cc8e8]">Clan rankings will use member contributions and unlocked benefits.</p>}
      <div className="mt-8 grid items-end gap-4 md:grid-cols-3">
        {[podium[1], podium[0], podium[2]].map((row, index) => <div key={`${row.name}-${index}`} className={`rounded-2xl border border-[#73c8ff]/45 bg-[#18558f] p-5 text-center ${index === 1 ? "md:-translate-y-5" : ""}`}><p className="text-3xl font-black text-[#bde8ff]">{index === 1 ? "1" : index === 0 ? "2" : "3"}</p><div className="mx-auto mt-3 flex h-24 w-24 items-center justify-center text-3xl font-black text-white/50">{row.name === "N/A" ? "N/A" : "#"}</div><h2 className="mt-3 font-black">{row.name}</h2><p className="mt-2 font-black text-[#bde8ff]">{row.value === null ? "N/A" : row.value.toLocaleString()}</p></div>)}
      </div>
      <div className="mt-8 max-w-2xl overflow-hidden rounded-2xl border border-[#d49a4a]/25 bg-[#3a2415]">
        <div className="grid grid-cols-[1fr_auto] px-5 py-4 text-xs font-bold uppercase tracking-widest text-[#b58d68]">
          <span>{view === "clans" ? "Clan" : "Player"}</span>
          <span>{view === "clans" ? "Treasury" : "Tokens"}</span>
        </div>
        {rows.length ? rows.map((row, index) => (
            <div
              key={`${row.name}-${index}`}
              className="grid grid-cols-[1fr_auto] px-5 py-4 text-sm"
            >
              <span>
                <b className="mr-3 text-[#ffe2a0]">#{index + 1}</b>
                {row.name}
              </span>
              <span className="font-bold text-[#f0d7ae]">{row.value.toLocaleString()}</span>
            </div>
          )) : <p className="px-5 py-8 text-center text-[#d9f3ff]">N/A</p>}
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

function ChatTab({ player, showBadge, giftNotice, clearGiftNotice, isGuest }: { player: Player; showBadge: (badge: string) => void; giftNotice: string; clearGiftNotice: () => void; isGuest: boolean }) {
  const [message, setMessage] = useState("");
  const [onlineCount, setOnlineCount] = useState(1);
  const [messages, setMessages] = useState<{ id?: string | number; user: string; text: string; badges?: string[] }[]>([
    { user: player.username, badges: player.badges, text: "Welcome to Breadlet chat." },
  ]);
  const supabase = useMemo(() => isGuest ? null : createSupabaseClient(), [isGuest]);
  const isVerified = player.badges?.includes("Verified");

  const loadMessages = useCallback(async () => {
    try {
      console.log('[CLIENT_CHAT] Fetching messages from /api/chat...');
      const response = await fetch("/api/chat", { cache: "no-store" });
      console.log('[CLIENT_CHAT] /api/chat HTTP status:', response.status);
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        console.error('[CLIENT_CHAT] /api/chat error payload:', err);
        return;
      }
      const rows = await response.json();
      console.log('[CLIENT_CHAT] /api/chat received rows:', rows);
      if (Array.isArray(rows)) {
        if (rows.length === 0) {
          setMessages([
            { user: player.username, badges: player.badges, text: "Welcome to Breadlet chat." },
          ]);
        } else {
          setMessages(
            rows.map((row: any) => {
              const username = row.user || (Array.isArray(row.profiles) ? row.profiles[0]?.username : row.profiles?.username) || "Player";
              return {
                id: row.id,
                user: username,
                text: row.message,
                badges: username === player.username ? player.badges : undefined,
              };
            })
          );
        }
      }
    } catch (err) {
      console.error('[CLIENT_CHAT] Error in loadMessages:', err);
    }
  }, [player.badges, player.username]);

  useEffect(() => {
    loadMessages();
    const loadPlayerCount = () => {
      fetch("/api/leaderboard", { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) return;
          const data = await response.json();
          if (Array.isArray(data.players)) setOnlineCount(Math.max(1, data.players.length));
        })
        .catch(() => undefined);
    };
    loadPlayerCount();
    const countTimer = window.setInterval(loadPlayerCount, 30000);
    if (!supabase) {
      console.warn('[CLIENT_CHAT] Supabase browser client not available for Realtime subscription');
      return () => window.clearInterval(countTimer);
    }

    console.log('[CLIENT_CHAT] Subscribing to Realtime postgres_changes on global_chat_messages');
    const channel = supabase
      .channel("global-chat")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "global_chat_messages" },
        (payload) => {
          console.log('[CLIENT_CHAT] Realtime event received:', payload);
          loadMessages();
        }
      )
      .subscribe((status) => {
        console.log('[CLIENT_CHAT] Realtime channel status:', status);
      });

    return () => {
      window.clearInterval(countTimer);
      console.log('[CLIENT_CHAT] Unsubscribing from Realtime global-chat');
      supabase.removeChannel(channel);
    };
  }, [loadMessages, supabase]);

  const sendMessageText = async (textToSend: string) => {
    if (!textToSend.trim()) return;
    if (supabase) {
      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: textToSend }),
        });
        if (response.ok) {
          const data = await response.json();
          const username = data.user || (Array.isArray(data.profiles) ? data.profiles[0]?.username : data.profiles?.username) || player.username;
          setMessages((current) => {
            if (data.id && current.some((m) => m.id === data.id)) return current;
            return [
              ...current,
              { id: data.id, user: username, text: data.message || textToSend, badges: player.badges },
            ];
          });
        }
      } catch (err) {
        console.error('[CLIENT_CHAT] Error sending message:', err);
      }
    } else {
      setMessages((current) => [...current, { user: player.username, badges: player.badges, text: textToSend }]);
    }
  };

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = message.trim();
    if (!text) return;
    setMessage("");
    await sendMessageText(text);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      alert("Image file size must be smaller than 3MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        sendMessageText(`[img]${reader.result}[/img]`);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const renderMessageContent = (text: string) => {
    if (text.startsWith("[img]") && text.endsWith("[/img]")) {
      const src = text.slice(5, -6);
      return (
        <img
          src={src}
          alt="Chat attachment"
          className="mt-2 max-h-60 max-w-xs rounded-xl border border-[#3d91cd] object-contain bg-[#103f75] p-1 shadow-md"
        />
      );
    }
    return <p className="text-sm text-[#d7b88c] whitespace-pre-wrap break-words">{text}</p>;
  };

  return (
    <div className="max-w-3xl rounded-3xl border border-[#d49a4a]/25 bg-[#3a2415] p-6">
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#ffe2a0]">
        {supabase ? "Supabase realtime" : "Prototype local chat"}
      </p>
      <div className="mt-2 flex items-center justify-between gap-4"><h1 className="text-4xl font-black">Global Chat</h1><span className="rounded-full bg-[#0c3b70] px-3 py-1 text-xs font-black text-[#73c8ff]">{onlineCount} players</span></div>
      {giftNotice && (
        <div className="modal-layer fixed inset-0 z-[9999] flex min-h-screen items-center justify-center bg-black/55 px-5 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-[#73c8ff] bg-[#18558f] p-6 text-center shadow-2xl">
            <p className="text-lg font-black text-[#bde8ff]">Gift notification</p>
            <p className="mt-3 text-sm text-[#d9f3ff]">{giftNotice}</p>
            <button onClick={clearGiftNotice} className="mt-5 w-full rounded-xl bg-[#39a8f5] px-4 py-3 font-black text-[#031426]">Close</button>
          </div>
        </div>
      )}
      <div className="mt-6 min-h-72 space-y-3 rounded-2xl bg-[#24170f] p-4 max-h-[500px] overflow-y-auto">
        {messages.map((item, index) => (
          <div key={`${item.id ?? item.user}-${index}`} className="flex gap-3">
            <img
              src={artFor(item.user === player.username ? player.equipped : "Bread Blook")}
              alt=""
              className="h-10 w-10 rounded-lg object-contain bg-[#103f75]"
            />
            <div>
              <div className="flex items-center gap-2 font-black">
                {item.user}
                {(item.user === player.username ? player.badges : item.badges || []).map((badge) => (
                  <button key={badge} onClick={() => showBadge(badge)} title={badge} className="h-5 w-5">
                    <img
                      src={
                        badge === "First 50"
                          ? "/assets/first-50-badge.svg"
                          : badge === "Verified"
                            ? "/assets/verified-badge.svg"
                            : "/assets/blooktuber-badge.svg"
                      }
                      alt={badge}
                      className="h-5 w-5 object-contain"
                    />
                  </button>
                ))}
              </div>
              {renderMessageContent(item.text)}
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={send} className="mt-4 flex items-center gap-3">
        {isVerified && (
          <label
            title="Upload image (Verified Badge Feature)"
            className="flex cursor-pointer items-center justify-center rounded-xl border border-[#3d91cd] bg-[#103f75] p-3 text-[#bde8ff] hover:bg-[#18558f] transition"
          >
            <ImageIcon size={20} />
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </label>
        )}
        <input
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={isVerified ? "Write a message or upload an image..." : "Write a message..."}
          className="min-w-0 flex-1 rounded-xl bg-[#24170f] px-4 py-3 text-white outline-none focus:border-[#3d91cd]"
        />
        <button type="submit" className="rounded-xl bg-[#e9bd67] px-5 py-3 font-black text-[#29170c]">
          Send
        </button>
      </form>
    </div>
  );
}

function BadgeModal({ badge, close }: { badge: string; close: () => void }) {
  return (
    <div className="modal-layer fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 px-5 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl border border-[#3d91cd] bg-[#103f75] p-6 text-center shadow-2xl">
        <img
          src={
            badge === "First 50"
              ? "/assets/first-50-badge.svg"
              : badge === "Verified"
                ? "/assets/verified-badge.svg"
                : "/assets/blooktuber-badge.svg"
          }
          alt={badge}
          className="mx-auto h-24 w-24 object-contain drop-shadow-md"
        />
        <h2 className="mt-4 text-2xl font-black text-white">{badge}</h2>
        <p className="mt-3 text-sm leading-6 text-[#9cc8e8]">{badgeDescriptions[badge]}</p>
        <button
          onClick={close}
          className="mt-6 w-full rounded-2xl bg-[#39a8f5] px-4 py-3 font-black text-[#031426] hover:bg-[#73c8ff] shadow-md transition"
        >
          Close
        </button>
      </div>
    </div>
  );
}
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
          ["Daily Crate", "Open once per day to win tokens, five Gold, or five Gem. The 5,000-token reward has a 1% chance."],
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
  grantReward,
  announcement,
  setAnnouncement,
  publishAnnouncement,
  grantGift,
}: {
  player: Player;
  grantReward: (targetId: string, reward: { tokens?: number; blookName?: string; badge?: string }) => Promise<void>;
  announcement: string;
  setAnnouncement: (value: string) => void;
  publishAnnouncement: () => void;
  grantGift: (gift: { title: string; message: string; tokens: number; materials: Record<string, number>; badges: string[]; blooks: string[] }) => void;
}) {
  const [tokenAmount, setTokenAmount] = useState("100");
  const [blookSearch, setBlookSearch] = useState("");
  const [banTarget, setBanTarget] = useState("");
  const [banReason, setBanReason] = useState("");
  const [banDuration, setBanDuration] = useState("24");
  const [giftTitle, setGiftTitle] = useState("");
  const [giftMessage, setGiftMessage] = useState("");
  const [giftBlook, setGiftBlook] = useState("");
  const [giftBadge, setGiftBadge] = useState("");
  const [giftMaterial, setGiftMaterial] = useState("Gold");
  const [giftMaterialAmount, setGiftMaterialAmount] = useState("0");
  const [banRecord, setBanRecord] = useState<{ target: string; reason: string; duration: string } | null>(null);
  const [players, setPlayers] = useState<{ id: string; username: string }[]>([]);
  const [targetId, setTargetId] = useState("");

  useEffect(() => {
    fetch("/api/admin").then(async (response) => {
      if (!response.ok) return;
      const rows = await response.json();
      if (Array.isArray(rows)) {
        setPlayers(rows);
        setTargetId((current) => current || rows[0]?.id || "");
      }
    }).catch(() => undefined);
  }, []);

  const allBlooks = [
    "Bread Blook",
    "Star Ship",
    "Red Rex",
    "Consolation",
    "Pixel UFO",
    "Golden Shuriken",
    "Blooket Gods",
    "Green Astronaut",
    "Blackbeard",
    "Butterfly",
    "Alien",
    "Golden UFO",
    "Mr. Receipt",
    "Mr. Frog",
    "Holy Bread",
    "Caveman",
    "Timeglass",
    "Aztec Coin",
    "Eclipse",
    "Ninja",
    "Doctor",
    "Crystal Ball",
    "Necklace",
    "Mars",
    "Earth",
    "Star",
    "Worker",
    "Chef",
    "Surgeon",
    "Actor",
    "Pixel Toast",
    "Pixel Chick",
    "Pixel Ice Slime",
    "Pixel Fuego",
    "Pixel Wizard",
    "Lava Slime",
    "Olive Grenade",
    "Shuriken",
    "Shield",
    "Spartan",
    "Blooket Life",
    "Fasty Jay",
    "Waymore",
  ];

  const filteredBlooks = allBlooks.filter((b) =>
    b.toLowerCase().includes(blookSearch.toLowerCase())
  );

  return (
    <div className="max-w-6xl space-y-6">
      <div className="rounded-3xl border border-[#73c8ff]/50 bg-[#18558f] p-8 shadow-xl">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#bde8ff]">
          Developer & Operator Controls
        </p>
        <h1 className="mt-2 text-4xl font-black text-white">Admin Panel</h1>
        <p className="mt-3 leading-7 text-[#d9f3ff]">
          Select a real player, then grant resources, Blooks, and badges through the server-side admin role.
        </p>
        <label className="mt-5 block max-w-md text-sm font-bold text-white">Reward target
            <select value={targetId} onChange={(event) => setTargetId(event.target.value)} className="mt-2 w-full rounded-xl border border-[#3d91cd] bg-[#bde8ff] px-3 py-2 text-[#062443]">
            {players.map((profile) => <option className="text-[#062443]" key={profile.id} value={profile.id}>{profile.username}</option>)}
          </select>
        </label>
      </div>

      {/* Quick Grants & Exact Token Grant */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-3xl border border-[#3d91cd] bg-[#103f75] p-6 shadow-md">
          <h2 className="text-xl font-black text-[#bde8ff] flex items-center gap-2">
            <img src="/assets/coin.svg" alt="" className="h-6 w-6" /> Token Grants
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[100, 1000, 10000, 100000].map((amt) => (
              <button
                key={amt}
                onClick={() => grantReward(targetId, { tokens: amt })}
                className="rounded-2xl border border-[#3d91cd]/50 bg-[#18558f] p-3 text-center font-black text-[#ffe2a0] hover:bg-[#24649c]"
              >
                +{amt.toLocaleString()}
              </button>
            ))}
          </div>
          <div className="mt-4 flex gap-3">
            <input
              value={tokenAmount}
              onChange={(e) => setTokenAmount(e.target.value)}
              type="number"
              min="0"
              placeholder="Custom token amount"
              className="min-w-0 flex-1 rounded-xl border border-[#3d91cd] bg-[#0c3b70] px-4 py-3 text-white outline-none"
            />
            <button
              onClick={() => grantReward(targetId, { tokens: Number(tokenAmount) || 0 })}
              className="rounded-xl bg-[#39a8f5] px-5 py-3 font-black text-[#031426] hover:bg-[#73c8ff]"
            >
              Grant
            </button>
          </div>
        </div>

        {/* Global Announcement */}
        <div className="rounded-3xl border border-[#3d91cd] bg-[#103f75] p-6 shadow-md">
          <h2 className="text-xl font-black text-[#bde8ff]">Global Announcement</h2>
          <p className="mt-1 text-sm text-[#9cc8e8]">Broadcast a message to all active players.</p>
          <div className="mt-4 flex flex-col gap-3">
            <input
              value={announcement}
              onChange={(e) => setAnnouncement(e.target.value)}
              placeholder="Type system announcement..."
              className="w-full rounded-xl border border-[#3d91cd] bg-[#0c3b70] px-4 py-3 text-white outline-none"
            />
            <button
              onClick={publishAnnouncement}
              className="rounded-xl bg-[#39a8f5] px-5 py-3 font-black text-[#031426] hover:bg-[#73c8ff]"
            >
              Publish Announcement
            </button>
          </div>
        </div>
      </div>

      {/* Grant Blooks with Visual Grid & Search */}
      <div className="rounded-3xl border border-[#3d91cd] bg-[#103f75] p-6 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-[#bde8ff]">Grant Blooks</h2>
            <p className="mt-1 text-sm text-[#9cc8e8]">Click any Blook card to add it directly to inventory.</p>
          </div>
          <input
            value={blookSearch}
            onChange={(e) => setBlookSearch(e.target.value)}
            placeholder="Search Blook..."
            className="w-56 rounded-xl border border-[#3d91cd] bg-[#0c3b70] px-3 py-2 text-sm text-white outline-none"
          />
        </div>
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 max-h-96 overflow-y-auto pr-1">
          {filteredBlooks.map((name) => (
            <button
              key={name}
              onClick={() => grantReward(targetId, { blookName: name })}
              className="group flex flex-col items-center justify-between rounded-2xl border border-[#3d91cd]/40 bg-[#18558f] p-3 text-center transition hover:border-[#39a8f5] hover:bg-[#24649c]"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-[#0c3b70] p-1">
                <RewardArt name={name} art={artFor(name)} className="h-full w-full object-contain" />
              </div>
              <span className="mt-2 text-xs font-black text-[#bde8ff] truncate w-full">{name}</span>
              <span className="mt-1 text-[10px] font-bold text-[#e9bd67] bg-[#0c3b70] px-2 py-0.5 rounded-full">+ Grant</span>
            </button>
          ))}
        </div>
      </div>

      {/* Grant Badges */}
      <div className="rounded-3xl border border-[#3d91cd] bg-[#103f75] p-6 shadow-md">
        <h2 className="text-2xl font-black text-[#bde8ff]">Grant Badges</h2>
        <p className="mt-1 text-sm text-[#9cc8e8]">Equip target badges to your profile.</p>
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { name: "First 50", icon: "/assets/first-50-badge.svg", desc: "First 50 pioneers" },
            { name: "Verified", icon: "/assets/verified-badge.svg", desc: "Verified trusted badge (Unlocks Chat Image Upload)" },
            { name: "BlookTuber", icon: "/assets/blooktuber-badge.svg", desc: "Creator badge" },
          ].map((b) => (
            <button
              key={b.name}
              onClick={() => grantReward(targetId, { badge: b.name })}
              className="flex items-center gap-3 rounded-2xl border border-[#3d91cd]/40 bg-[#18558f] p-4 text-left transition hover:border-[#39a8f5] hover:bg-[#24649c]"
            >
              <img src={b.icon} alt={b.name} className="h-12 w-12 object-contain" />
              <div>
                <p className="font-black text-[#bde8ff]">{b.name}</p>
                <p className="text-xs text-[#9cc8e8]">{b.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Gift Composer & Moderation */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Gift Composer */}
        <div className="rounded-3xl border border-[#3d91cd] bg-[#103f75] p-6 shadow-md">
          <h2 className="text-xl font-black text-[#bde8ff]">Admin Gift Composer</h2>
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <input value={giftTitle} onChange={(e) => setGiftTitle(e.target.value)} placeholder="Gift Title" className="rounded-xl border border-[#3d91cd] bg-[#0c3b70] px-3 py-2.5 text-sm text-white" />
              <input value={giftMessage} onChange={(e) => setGiftMessage(e.target.value)} placeholder="Gift Message" className="rounded-xl border border-[#3d91cd] bg-[#0c3b70] px-3 py-2.5 text-sm text-white" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input value={giftBlook} onChange={(e) => setGiftBlook(e.target.value)} placeholder="Blook Name" className="rounded-xl border border-[#3d91cd] bg-[#0c3b70] px-3 py-2.5 text-sm text-white" />
              <input value={giftBadge} onChange={(e) => setGiftBadge(e.target.value)} placeholder="Badge Name" className="rounded-xl border border-[#3d91cd] bg-[#0c3b70] px-3 py-2.5 text-sm text-white" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select value={giftMaterial} onChange={(e) => setGiftMaterial(e.target.value)} className="rounded-xl border border-[#3d91cd] bg-[#0c3b70] px-3 py-2.5 text-sm text-white">
                {materialNames.map((m) => <option key={m}>{m}</option>)}
              </select>
              <input value={giftMaterialAmount} onChange={(e) => setGiftMaterialAmount(e.target.value)} type="number" min="0" placeholder="Qty" className="rounded-xl border border-[#3d91cd] bg-[#0c3b70] px-3 py-2.5 text-sm text-white" />
            </div>
            <button
              onClick={() => grantGift({ title: giftTitle, message: giftMessage, tokens: Number(tokenAmount) || 0, blooks: giftBlook ? [giftBlook] : [], badges: giftBadge ? [giftBadge] : [], materials: { [giftMaterial]: Number(giftMaterialAmount) || 0 } })}
              className="w-full rounded-xl bg-[#39a8f5] px-4 py-3 font-black text-[#031426] hover:bg-[#73c8ff]"
            >
              Send Gift Package
            </button>
          </div>
        </div>

        {/* Moderation */}
        <div className="rounded-3xl border border-[#ef8b9d]/40 bg-[#421f45] p-6 shadow-md">
          <h2 className="text-xl font-black text-[#ffd6df]">Moderation & Bans</h2>
          <p className="mt-1 text-sm text-[#f2b9c7]">Issue temporary or permanent sanctions.</p>
          <div className="mt-4 space-y-3">
            <input value={banTarget} onChange={(e) => setBanTarget(e.target.value)} placeholder="Player Username" className="w-full rounded-xl border border-[#b85a77] bg-[#351c3a] px-3 py-2.5 text-sm text-white" />
            <div className="grid grid-cols-2 gap-2">
              <input value={banDuration} onChange={(e) => setBanDuration(e.target.value)} type="number" min="1" placeholder="Duration (Hours)" className="rounded-xl border border-[#b85a77] bg-[#351c3a] px-3 py-2.5 text-sm text-white" />
              <input value={banReason} onChange={(e) => setBanReason(e.target.value)} placeholder="Reason" className="rounded-xl border border-[#b85a77] bg-[#351c3a] px-3 py-2.5 text-sm text-white" />
            </div>
            <button
              onClick={() => { if (banTarget.trim()) setBanRecord({ target: banTarget.trim(), reason: banReason.trim() || "No reason provided", duration: banDuration }); }}
              className="w-full rounded-xl bg-[#ef8b9d] px-4 py-3 font-black text-[#351c3a] hover:bg-[#ffb3c1]"
            >
              Issue Ban Sanction
            </button>
            {banRecord && (
              <div className="rounded-2xl border border-[#ef8b9d]/50 bg-[#351c3a] p-3 text-xs">
                <p className="font-black text-[#ffd6df]">{banRecord.target} is banned ({banRecord.duration} hrs)</p>
                <p className="text-[#f2b9c7]">Reason: {banRecord.reason}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
function ClanTab({
  player,
  setClan,
  savePlayer,
  isGuest,
}: {
  player: Player;
  setClan: (tag: string) => void;
  savePlayer: (player: Player) => void;
  isGuest: boolean;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [clan, setClanState] = useState<{ id?: string; name: string; description: string; tags: string[]; members: number; treasury: number } | null>(null);
  const [filter, setFilter] = useState("");
  const [dbClans, setDbClans] = useState<{ id?: string; name: string; description: string; tags: string[]; members: number; treasury: number }[]>([]);

  const loadClans = useCallback(async () => {
    try {
      const res = await fetch("/api/clans", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.clans && Array.isArray(data.clans)) {
          const list = data.clans.map((c: any) => ({
            id: c.id,
            name: c.name,
            description: c.description || "",
            tags: Array.isArray(c.tags) ? c.tags : [],
            members: c.member_count || 1,
            treasury: c.treasury || 0,
          }));
          setDbClans(list);
          const myClan = list.find((c: any) => player.clanTag && c.name.toUpperCase().startsWith(player.clanTag));
          if (myClan) setClanState(myClan);
        }
      }
    } catch {
      // Ignore network errors
    }
  }, [player.clanTag]);

  useEffect(() => {
    loadClans();
  }, [loadClans]);

  const allClans = dbClans;

  const clans = allClans.filter((item) => !filter || item.tags.some((tag) => tag.includes(filter.toLowerCase())) || item.name.toLowerCase().includes(filter.toLowerCase()));

  const handleCreateClan = async () => {
    if ((!isGuest && player.tokens < 5000) || !name.trim() || tags.length > 3) return;
    if (isGuest) {
      setClanState({ name, description, tags, members: 1, treasury: 0 });
      setClan(name.slice(0, 5));
      setShowCreate(false);
      return;
    }
    try {
      const res = await fetch("/api/clans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim(), tags, thumbnailUrl }),
      });
      if (res.ok) {
        const data = await res.json();
        savePlayer({ ...player, tokens: player.tokens - 5000 });
        setClanState({ id: data.clan?.id, name, description, tags, members: 1, treasury: 0 });
        setClan(name.slice(0, 5));
        setShowCreate(false);
        loadClans();
        return;
      }
    } catch {
      // Fall back to local
    }
    savePlayer({ ...player, tokens: player.tokens - 5000 });
    setClanState({ name, description, tags, members: 1, treasury: 0 });
    setClan(name.slice(0, 5));
    setShowCreate(false);
  };

  const handleDonate = async () => {
    if ((!isGuest && player.tokens < 100) || !clan) return;
    if (isGuest) {
      setClanState({ ...clan, treasury: clan.treasury + 100 });
      return;
    }
    if (clan.id) {
      try {
        const res = await fetch("/api/clans", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clanId: clan.id, amount: 100 }),
        });
        if (res.ok) {
          const data = await res.json();
          savePlayer({ ...player, tokens: player.tokens - 100 });
          setClanState({ ...clan, treasury: data.treasury });
          loadClans();
          return;
        }
      } catch {
        // Fall back to local
      }
    }
    savePlayer({ ...player, tokens: player.tokens - 100 });
    setClanState({ ...clan, treasury: clan.treasury + 100 });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4"><h1 className="text-4xl font-black">Clans</h1><button onClick={() => setShowCreate(true)} className="rounded-xl bg-[#39a8f5] px-4 py-2 font-black text-white">Create Clan</button></div>
      {showCreate && <div className="modal-layer fixed inset-0 flex items-center justify-center bg-black/75 px-5 backdrop-blur-sm"><div className="w-full max-w-lg rounded-3xl border border-[#247bc0] bg-[#103f75] p-6"><div className="flex items-center justify-between"><h2 className="text-xl font-black text-[#bde8ff]">Create a clan · {isGuest ? "FREE" : "5,000 tokens"}</h2><button onClick={() => setShowCreate(false)} className="text-[#bde8ff]">Close</button></div><label className="mt-5 flex h-36 cursor-pointer items-center justify-center rounded-2xl border border-dashed border-[#3d91cd] bg-[#0c3b70] p-3">{thumbnailUrl ? <img src={thumbnailUrl} alt="Clan preview" className="h-full max-w-full object-contain" /> : <span className="text-sm text-[#9cc8e8]">Upload clan image</span>}<input type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => typeof reader.result === "string" && setThumbnailUrl(reader.result); reader.readAsDataURL(file); }} /></label><div className="mt-3 grid gap-3"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Clan name" className="rounded-xl border border-[#3d91cd] bg-[#0c3b70] px-3 py-3 text-white" /><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description" className="rounded-xl border border-[#3d91cd] bg-[#0c3b70] px-3 py-3 text-white" /><input value={tags.join(", ")} onChange={(event) => setTags(event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 3))} placeholder="Up to 3 tags" className="rounded-xl border border-[#3d91cd] bg-[#0c3b70] px-3 py-3 text-white" /></div><button onClick={handleCreateClan} className="mt-4 rounded-xl bg-[#39a8f5] px-4 py-3 font-black text-[#031426]">Create clan</button></div></div>}
      {clan && <div className="rounded-2xl border border-[#73c8ff] bg-[#18558f] p-5"><h2 className="text-xl font-black">{clan.name}</h2><p className="mt-1 text-[#d9f3ff]">{clan.description}</p><p className="mt-2 text-sm text-[#bde8ff]">{clan.members}/25 members · Treasury {clan.treasury}</p><button onClick={handleDonate} className="mt-3 rounded-xl bg-[#39a8f5] px-4 py-3 font-black text-[#031426]">Donate {isGuest ? "free" : "100 tokens"}</button><p className="mt-2 text-xs text-[#d9f3ff]">Warning: donated tokens cannot be withdrawn by members; only the clan leader can withdraw the treasury.</p></div>}
      <div className="rounded-3xl border border-[#247bc0] bg-[#103f75] p-6"><div className="flex items-center justify-between gap-3"><h2 className="text-2xl font-black">Clans</h2><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter tags" className="w-40 rounded-xl border border-[#3d91cd] bg-[#0c3b70] px-3 py-2 text-white" /></div><div className="mt-5 grid gap-3 md:grid-cols-3">{clans.length ? clans.map((item) => <article key={item.name} className="rounded-2xl border border-[#3d91cd] bg-[#18558f] p-4"><h3 className="font-black text-[#bde8ff]">{item.name}</h3><p className="mt-2 text-sm text-[#d9f3ff]">{item.description}</p><div className="mt-3 flex flex-wrap gap-1">{item.tags.map((tag) => <span key={tag} className="rounded-full bg-[#0c3b70] px-2 py-1 text-xs text-[#bde8ff]">#{tag}</span>)}</div><p className="mt-3 text-xs text-[#9cc8e8]">{item.members}/25 members · {item.treasury} treasury</p></article>) : <p className="col-span-full py-10 text-center text-[#9cc8e8]">N/A</p>}</div></div>
    </div>
  );
}
function CraftingTab({
  player,
  salvage,
  craft,
  isGuest,
}: {
  player: Player;
  salvage: (name: string) => void;
  craft: (material: string) => void;
  isGuest: boolean;
}) {
  const [search, setSearch] = useState("");
  const unique = player.inventory.filter(
    (name, index, items) => items.indexOf(name) === index,
  ).filter((name) => name.toLowerCase().includes(search.toLowerCase()));
  return (
    <div>
      <h1 className="text-4xl font-black">Crafting</h1>
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
            {craftRecipes.map((recipe) => { const enough = isGuest || bundleEntries(recipe.ingredients).every(([material, amount]) => (player.materials[material] || 0) >= amount); return <button key={recipe.name} onClick={() => craft(recipe.name)} title={`Craft ${recipe.name}`} aria-label={`Craft ${recipe.name}`} className="craft-process group flex w-full items-center gap-3 rounded-2xl bg-[#24170f] p-3 text-left"><span className="flex min-h-12 min-w-12 shrink-0 items-center justify-center gap-0.5 rounded-xl bg-[#6c4328] p-1">{bundleEntries(recipe.ingredients).map(([material, amount]) => <span key={material} title={`${amount} ${material}`} className="relative"><img src={materialArtFor(material)} alt="" className="h-7 w-7 object-contain" /><b className="absolute -right-1 -top-1 rounded-full bg-[#e9bd67] px-1 text-[8px] text-[#29170c]">{amount}</b></span>)}</span><span className="h-px flex-1 bg-[#8e623c]" /><span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-[#d49a4a]/40 bg-[#3a2415]"><img src={artFor(recipe.name)} alt={recipe.name} className="h-14 w-14 object-contain" /></span><span className="min-w-0 flex-1"><strong className="block truncate">{recipe.name}</strong><small className={enough ? "text-[#e9bd67]" : "text-[#b58d68]"}>{isGuest ? "Free to craft" : enough ? "Ready to craft" : "20 total materials"}</small></span><span className={`text-2xl transition group-hover:translate-x-1 ${enough ? "text-[#ffe2a0]" : "text-[#8e623c]"}`}>→</span></button>; })}
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
