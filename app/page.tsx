"use client";

import { chanceFor, isRewardActive, rotationSlotFor, craftRecipeFor, craftRecipes, craftedRarityFor, dismantleBundleFor, legacyCapsules, liveCapsules, materialNames, rarityOrder, sellValueForBlook, sortByRarity, wheelRewards } from "../lib/gameplay-catalog";
import type { Capsule, MaterialBundle, Reward } from "../lib/gameplay-catalog";
import { isMarketPackInStock, isSeasonalPackLocked, marketPackStock, nextMarketRefreshAt, seasonalPackOpensAt } from "../lib/market-stock";
import { GameTour } from "./components/game-tour";
import { LiveTrade } from "./components/live-trade";
import { SettingsTab, readSettings } from "./components/settings-tab";
import { isInboxType } from "../lib/inbox";
import { BreadletExplore } from "./components/breadlet-explore";
import { GAMES_CHANGED_EVENT } from "./components/chat-games";
import { AdminAbusePanel, AdminEventsLayer } from "./components/admin-events";
import { CoinFlipPopup, GamesMenu, postGameAction } from "./components/chat-games";
import { CustomEmoji, EmojiPicker, renderEmojiText, useCustomEmojis } from "./components/emoji-picker";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient as createSupabaseClient, fetchGameplayApi, fetchSecretApi, fetchTradeApi } from "../lib/supabase/client";
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
  Users,
  ChevronDown,
  Image as ImageIcon,
  HelpCircle,
  LogOut,
  Search,
  GitBranch,
  CirclePlay,
  Package,
  Gift,
  Info,
  Wallet,
  Sparkles,
  Reply,
  Pencil,
  Trash2,
  Coins,
  Zap,
  Repeat,
  Clock,
  CalendarDays,
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
  | "resources"
  | "bank"
  | "referrals"
  | "clan"
  | "crafting"
  | "settings"
  | "admin"
  | "explore";


type Listing = { id: number | string; seller: string; sellerId?: string; blook: string; price: number; quantity?: number; listedAt?: string; sellerBlook?: string };
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
  wheelSpunAt?: string;
  guestStarterRemoved?: boolean;
  capsulesOpened?: number;
  messagesSent?: number;
  completedTrades?: number;
  trainScore?: number;
  exploreBeta?: boolean;
  chatMutedUntil?: string;
  createdAt?: string;
  // Locked Breadlets can't be sold, recycled or traded by mistake. Wishlist: Bazaar alerts.
  lockedBlooks?: string[];
  wishlist?: string[];
};
type PublicProfile = {
  id: string;
  username: string;
  tokens: number;
  equippedBlook: string;
  inventoryCount: number;
  badges: string[];
  capsulesOpened: number;
  messagesSent: number;
  clanTag?: string;
  createdAt?: string | null;
};
type NavItem = { id: Tab; label: string; icon: React.ReactNode };
type PlayerNotification = { id: string; type: string; payload: { title?: string; message?: string; quantity?: number; from?: string; messageId?: string }; is_read?: boolean; created_at?: string };

const inboxIcons: Record<string, string> = { mention: "💬", bazaar_sale: "🛒", trade_completed: "🤝", referral: "🎉", wishlist: "⭐", admin_gift: "🎁", summary: "📬" };

// A short two-note chime for new Inbox notifications (Web Audio, so no sound file to load).
function playChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    [880, 1320].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + index * 0.13;
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.4);
    });
    window.setTimeout(() => void context.close(), 1000);
  } catch {
    // Some browsers block audio until the player has clicked something; the toast still shows.
  }
}
type ClanRecord = {
  id?: string;
  name: string;
  description: string;
  tags: string[];
  members: number;
  treasury: number;
  thumbnailUrl?: string;
  profileBlook?: string;
  bannerData?: string;
  ownerProfileId?: string;
  ownerName?: string;
  role?: string;
  memberCapacity: number;
  nameChangeUnlocked: boolean;
  bannerUnlocked: boolean;
  colorsUnlocked: boolean;
  theme: string;
  animatedProfiles: boolean;
};
type ClanJoinRequest = { id: string; clanId: string; username: string; createdAt: string };
type ClanMemberRecord = { profileId: string; username: string; role: string; tokenContributions: number; equippedBlook: string };

const playerKey = "breadlet-player";
const MAINTENANCE_BYPASS_CODE = "admincodeiscool32";
// Share of each Bazaar sale that is destroyed (see migration 0057).
const BAZAAR_FEE_RATE = 0.1;
// Forces the maintenance screen without needing the database (the normal switch lives in
// app_settings). Set back to false once Supabase is reachable again.
const FORCE_MAINTENANCE = false;
const MAINTENANCE_BYPASS_KEY = "breadlet-maintenance-bypass";
const guestPlayerKey = "breadlet-guest-player";
const guestSessionPlayerKey = "breadlet-guest-session-player";
const firstFiftyKey = "breadlet-first-fifty-count";
const badgeDescriptions: Record<string, string> = {
  "First 50": "Awarded to the first 50 players to join Breadlet.",
  Verified: "A verified badge for trusted, well-known community members.",
  BlookTuber: "Awarded to YouTubers who create Breadlet content or similar collectible-game content.",
  "10K Tokens": "Reach a balance of 10,000 Bread Bucks.",
  "100K Tokens": "Reach a balance of 100,000 Bread Bucks.",
  "1M Tokens": "Reach a balance of 1,000,000 Bread Bucks.",
  OG: "Awarded to the original Breadlet players who joined before October 22, 2026.",
  Moderator: "Trusted community moderator who keeps the chat friendly.",
  Owner: "The creator and owner of Breadlet.",
  Contributor: "Helped build Breadlet with art, ideas or code.",
  Artist: "Drew artwork for Breadlet.",
  Birthday: "Happy birthday! Given by an admin on your birthday.",
};
// Badges an admin can hand out. Token milestones are automatic from the balance, OG from the
// account age, and Owner / Moderator are tied to the staff usernames, so granting those by hand
// would only fake them.
const grantableBadges = Object.keys(badgeDescriptions).filter((badge) => !["10K Tokens", "100K Tokens", "1M Tokens", "OG", "Owner", "Moderator"].includes(badge));
// OG is no longer automatic: the server adds it only for accounts made before the cutoff (lib/og-badge.ts).
const tokenBadgesFor = (tokens: number) => [
  ...(tokens >= 10000 ? ["10K Tokens"] : []),
  ...(tokens >= 100000 ? ["100K Tokens"] : []),
  ...(tokens >= 1000000 ? ["1M Tokens"] : []),
];
const badgeIconFor = (badge: string) => ({
  "First 50": "/assets/first-50-badge.svg",
  Verified: "/assets/verified-badge.svg",
  BlookTuber: "/assets/blooktuber-badge.svg",
  "10K Tokens": "/assets/token-badge-10k.svg",
  "100K Tokens": "/assets/token-badge-100k.svg",
  "1M Tokens": "/assets/token-badge-1m.svg",
  OG: "/assets/og-badge.svg",
  Moderator: "/assets/moderator-badge.svg",
  Owner: "/assets/owner-badge.svg",
  Contributor: "/assets/contributer.svg",
  Artist: "/assets/artist-badge.svg?v=2",
  Birthday: "/assets/birthday-badge.svg",
})[badge] || "/assets/verified-badge.svg";
// Red box + name placeholder for items awaiting final artwork.
const placeholderArt = (label: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><rect width='240' height='240' rx='16' fill='#b91c1c' stroke='#7f1d1d' stroke-width='8'/><text x='50%' y='50%' fill='#ffffff' font-family='sans-serif' font-size='22' font-weight='700' text-anchor='middle' dominant-baseline='middle'>${label}</text></svg>`)}`;
const artFor = (name: string) =>
  ({
    Mars: "/assets/mars-3.svg",
    Worker: "/assets/worker.svg",
    "Aztec Coin": "/assets/Aztect Coin 2.0.svg",
    "Magnifying Glass": "/assets/magnifying-glass.svg",
    "Coffee Mug": "/assets/coffee-mug.svg",
    "Clay Vase": "/assets/clay-vase.svg",
    Map: "/assets/map (1).svg",
    Wallet: "/assets/wallet.svg",
    "Pixel Apple": "/assets/Lost and found + food pack/Pixel apple.png?v=2",
    "Pixel Caramel": "/assets/Lost and found + food pack/Pixel carmel.png?v=2",
    "Pixel Crystal Ball": "/assets/Lost and found + food pack/Right pixl crystal ball texture .png?v=2",
    "Lava Slime": "/assets/lava-slime.svg",
    Ted: "/assets/ted-shopkeeper.svg",
    "Walter White": "/assets/walter-white.svg?v=2",
    "Olive Grenade": "/assets/grenade2.svg",
    "Golden Grenade": "/assets/gold grenade2.svg",
    "Sour Dough": "/assets/sour-dough-refreshed.svg",
    "Burnt Toast": "/assets/Burnt toast.svg",
    Brioche: "/assets/brioche.svg",
    Chef: "/assets/chef (1).svg",
    Earth: "/assets/earth-3.svg",
    Globe: "/assets/earth-globe.svg",
    Surgeon: "/assets/doctor 2.0.svg",
    Doctor: "/assets/doctor 2.0.svg",
    "Crystal Ball": "/assets/crystal-ball-3.svg",
    "Pixel Bomb": "/assets/Lost and found + food pack/Pixel bomb.png?v=2",
    "Pixel Constellation": "/assets/Lost and found + food pack/Pixel constilation.png?v=2",
    "Pixel Aztec Coin": "/assets/Lost and found + food pack/Pixel axtect coin.png?v=2",
    "Pixel Lagoon": "/assets/Lost and found + food pack/Pixel lagon.png?v=2",
    "Blooket Life": "/assets/new blooket life.png",
    "Blooket Gods": "/assets/new blooket gods.png",
    "Twisted Bread": "/assets/twisted-bread-blooktuber.png",
    SRN: "/assets/srn-blooktuber.png",
    "Blook Master": "/assets/blook-master.png",
    Turtwix: "/assets/turtwix.png",
    Lagoon: "/assets/New Lag0n.png",
    Shuriken: "/assets/shuricken 2.svg",
    "Albino Crow": "/assets/albino crow.svg",
    Baguette: "/assets/bagget.svg",
    Star: "/assets/Lost and found + food pack/stars 2.svg",
    Consolation: "/assets/Lost and found + food pack/contilation 2.svg",
    "Laser Blaster": "/assets/contilation.svg",
    "Yellow Platypus": "/assets/yellowplatypus.svg",
    Eclipse: "/assets/solar%20ecplise%20but%20good.svg",
    Sun: "/assets/sun.svg",
    Necklace: "/assets/neclase 2.0 .svg",
    Ninja: "/assets/Ninja 2.0.svg",
    Santa: "/assets/santa pixel.png",
    "Fasty Jay": "/assets/fastyjaynew.png",
    Waymore: "/assets/new waymore.png",
    Shield: "/assets/sheild (1).svg",
    Spartan: "/assets/spartan-new.svg",
    Solider: "/assets/solider.svg",
    "Gold Bread": "/assets/gold-bread-refreshed.svg",
    Sword: "/assets/sword way better.svg",
    "Diamond Sword": "/assets/diamond sword frame one.svg",
    "Golden Toaster": "/assets/goldenToaster%20frame%201.svg",
    "Lost and Found Box": "/assets/Lost%20and%20found%20box%20frame%201.svg",
    "Stone Tablet": "/assets/Stone tablet (1).svg",
    Actor: "/assets/actor.svg",
    Alien: "/assets/Lost and found + food pack/alien 2.svg",
    Wheel: "/assets/wheel.svg",
    Letter: "/assets/letter.svg",
    Gears: "/assets/gears.svg",
    "Da Vinci's Ornithopter": "/assets/DaVinci'sOrnothopter (1).svg",
    "Leonardo da Vinci's Tank": "/assets/DaVinci'sOrnothopter2.svg",
    "Leonardo da Vinci": "/assets/leonardo da vici.svg",
    Bitcoin: "/assets/bitcoin.svg",
    "Crimson Octopus": "/assets/crimsonoctopus.svg",
    Caveman: "/assets/caveman.svg",
    Timeglass: "/assets/timeglass/frame-1.svg",
    "Pixel Sprinkle Bread": "/assets/Lost and found + food pack/Pixel sprinkle bread frame 1.png?v=2",
    "Star Ship": "/assets/star ship frame 1.svg",
    "Skeleton Pirate": "/assets/Skeleton pirate frame 1.svg",
    "Festive Skeleton Pirate": "/assets/feative Skeleton pirate .svg",
    "Space Goo": "/assets/space goo 2.0.svg",
    "Bread Blook": "/assets/new breadblook.png",
    "Golden Shuriken": "/assets/gold shuricken 2.svg",
    "Holy Bread": "/assets/holy-bread-refreshed.svg",
    "Red Rex": "/assets/red-rex.svg",
    "Golden UFO": "/assets/golden tim the alien.png",
    "Mr. Receipt": "/assets/mr-receipt.svg",
    "Mr. Frog": "/assets/Mr.frog.svg",
    Donut: "/assets/bagel.svg",
    "Cinnamon Roll": "/assets/cinnamon-roll-refreshed.svg",
    Croissant: "/assets/croissant.svg",
    "Robo Bread": "/assets/robo-bread-2.svg",
    "Slime Bread": "/assets/slime-bread.svg",
    Toaster: "/assets/toaster-bread.svg",
    "Green Astronaut": "/assets/green-astronaut-blooktuber.png",
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
    Rock: "/assets/rock-refreshed.svg",
    Button: "/assets/Lost and found + food pack/button.svg",
    "Car Keys": "/assets/Lost and found + food pack/car keys .svg",
    Comb: "/assets/Lost and found + food pack/comb.svg",
    Hat: "/assets/Lost and found + food pack/hat.svg",
    Textbook: "/assets/Lost and found + food pack/Textbook.svg",
    Tablet: "/assets/Lost and found + food pack/tablet.svg",
    Apple: "/assets/Lost and found + food pack/apple.svg",
    Avocado: "/assets/avocado-2.svg",
    Potato: "/assets/potato-2.svg",
    Carrot: "/assets/carrot-2.svg",
    Fries: "/assets/fries-2.svg",
    Egg: "/assets/egg-2.svg",
    "Candy Corn": "/assets/candy-corn-refreshed.svg",
    Caramel: "/assets/Lost and found + food pack/carmel.svg",
    "Sprinkle Bread": "/assets/Sprinkle bread improved.svg",
    "Ice Cream": "/assets/Lost and found + food pack/ice cream .svg",
    Pickle: "/assets/pickle-2.svg",
    "The Bomb": "/assets/Lost and found + food pack/bomb.svg",
    Nunchucks: "/assets/Lost and found + food pack/nunchucks (rplacemnt for sheild..svg",
    // Winter Bag
    Snowball: "/assets/winter/snowball.svg",
    Mitten: "/assets/winter/mitten.svg",
    "Christmas Candy": "/assets/winter/christmas-candy.svg",
    "Santa Hat": "/assets/winter/santa-hat.svg",
    Ornament: "/assets/winter/ornament.svg",
    "Chocolate Coin": "/assets/winter/chocolate-coin.svg",
    Stocking: "/assets/winter/stocking.svg",
    "Chocolate Candy Cookie": "/assets/winter/chocolate-candy-cookie.svg",
    "Sugar Cookie": "/assets/winter/sugar-cookie.svg",
    "Macadamia Nut Cookie": "/assets/winter/macadamia-nut-cookie.svg",
    "Gingerbread Cookie": "/assets/winter/gingerbread-cookie.svg",
    Present: "/assets/winter/present.svg",
    "Festive Breadlet": "/assets/winter/festive-breadlet.svg",
    Reindeer: "/assets/winter/reindeer-1.svg",
    Gnome: "/assets/winter/gnome-1.svg",
    // Fall Bag
    Pumpkin: "/assets/fall/pumpkin.svg",
    "Chai Tea": "/assets/fall/chai-tea.svg",
    "Cherry Pie": "/assets/fall/cherry-pie.svg",
    "Pumpkin Pie": "/assets/fall/pumpkin-pie.webp",
    Corn: "/assets/fall/corn.webp",
    "Cooked Turkey": "/assets/fall/cooked-turkey.svg",
    Tanuki: "/assets/fall/tanuki-1.svg",
  })[name.replace(/^Shiny /, "")] || "/assets/Bread.svg";
const artForBlook = (name: string, artworkKey?: string) => {
  const mappedArt = artFor(name);
  if (mappedArt !== "/assets/Bread.svg" || !artworkKey) return mappedArt;
  return `/assets/${artworkKey.split("/").map(encodeURIComponent).join("/")}`;
};
function AnimatedArtFrame({ src, name, className }: { src: string; name: string; className: string }) {
  return (
    <span className={`relative inline-flex h-full w-full shrink-0 items-center justify-center ${className}`}>
      <img src={src} alt={name} decoding="async" className="reward-art-frame absolute inset-0 h-full w-full object-contain" />
    </span>
  );
}
// Every bump on the pickle art (as % of the pickle's box), each with its own size and timing.
const PICKLE_DRIPS = [
  { x: 90, y: 93, size: 17, delay: 0, length: 3 },
  { x: 87, y: 70, size: 13, delay: 1.5, length: 3.4 },
  { x: 67, y: 39, size: 11, delay: 0.7, length: 3.8 },
  { x: 6, y: 28, size: 11, delay: 2.2, length: 3.6 },
  { x: 8, y: 52, size: 12, delay: 0.3, length: 3.2 },
  { x: 32, y: 84, size: 12, delay: 1.1, length: 3.5 },
  { x: 53, y: 85, size: 12, delay: 2.6, length: 3.9 },
];

// Pickle oozes: drops grow out of every bump, droop, then fall (pure CSS, no re-renders).
function OozingPickle({ className }: { className: string }) {
  return (
    <span className={`pickle-frame relative inline-flex h-full w-full shrink-0 items-center justify-center ${className}`}>
      <span className="pickle-body">
        <img src="/assets/pickle-2.svg" alt="Pickle" decoding="async" className="h-full w-full object-contain" />
        {PICKLE_DRIPS.map((drip, index) => (
          <span key={index} className="pickle-drip" aria-hidden="true" style={{ left: `${drip.x}%`, top: `${drip.y}%`, width: `${drip.size}%`, "--drip-delay": `${drip.delay}s`, "--drip-length": `${drip.length}s` } as React.CSSProperties}>
            <img src="/assets/pickle-ooze.svg" alt="" />
          </span>
        ))}
      </span>
    </span>
  );
}



const rarityClassFor = (rarity: string) =>
  rarity === "Unique"
    ? "rarity-unique"
    : rarity === "Breadled"
      ? "rarity-breadled"
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
    Breadled: "border-yellow-300/70 bg-yellow-400/15 text-yellow-100",
  };
  return classes[rarity] || classes.Common;
};
const rewardEffectClassFor = (name: string, rarity: string) => {
  const cleanName = name.replace(/^Shiny /, "");
  if (cleanName === "Star Ship") return "";
  return `${rarityClassFor(rarity)} ${cleanName === "Bread Blook" ? "rainbow-blook" : ""} ${cleanName === "Holy Bread" ? "golden-glow" : ""} ${cleanName === "Red Rex" ? "red-rex-bounce" : ""} ${cleanName === "Crimson Octopus" ? "crimson-octopus-glow" : ""}`;
};

const shinyEligibleNames = new Set<string>();
const shinyNameFor = (name: string) => name;



const wheelRarityFor = (reward: (typeof wheelRewards)[number]) => {
  if (reward.type === "material") return reward.material === "Gem" ? "Legendary" : "Epic";
  if (reward.amount >= 5000) return "Mythic";
  if (reward.amount >= 4000) return "Legendary";
  if (reward.amount >= 2000) return "Epic";
  if (reward.amount >= 1000) return "Rare";
  if (reward.amount >= 500) return "Uncommon";
  return "Common";
};

// "5 days", "3 months", "1 year" since the account was made.
const accountAgeLabel = (createdAt?: string | null) => {
  const created = Date.parse(String(createdAt || ""));
  if (!Number.isFinite(created)) return "—";
  const days = Math.floor((Date.now() - created) / 86400000);
  const plural = (count: number, unit: string) => `${count} ${unit}${count === 1 ? "" : "s"}`;
  if (days < 1) return "New today";
  if (days < 60) return plural(days, "day");
  if (days < 730) return plural(Math.floor(days / 30), "month");
  return plural(Math.floor(days / 365), "year");
};

// /api/player only sends the profile counts and Bazaar listings with ?full=1 (startup, login,
// opening your profile); other responses leave them out, so the last ones received are kept.
let lastFullPlayerData: { id: string; activity: any; listings: any[] } | null = null;
function playerFromServer(data: any): Player {
  const inventory = (data.inventory || []).map((name: string) => name === "Surgeon" ? "Doctor" : name);
  const kept = lastFullPlayerData?.id === data.profile.id ? lastFullPlayerData : null;
  if (data.activity || Array.isArray(data.listings)) lastFullPlayerData = { id: data.profile.id, activity: data.activity || kept?.activity || null, listings: Array.isArray(data.listings) ? data.listings : kept?.listings || [] };
  data = { ...data, activity: data.activity || kept?.activity, listings: Array.isArray(data.listings) ? data.listings : kept?.listings };
  return {
    id: data.profile.id,
    username: data.profile.username,
    password: "",
    tokens: data.profile.tokens || 0,
    mined: data.mine?.current_earnings_today || 0,
    inventory,
    equipped: (data.profile.equipped_blook_name === "Surgeon" ? "Doctor" : data.profile.equipped_blook_name) || inventory[0] || "",
    pickaxe: Math.max(0, (data.mine?.pickaxe_level || 1) - 1),
    listings: data.listings || [],
    clanTag: data.profile.clan_tag || "",
    materials: { ...emptyMaterials(), ...(data.materials || {}) },
    badges: data.profile.badges || data.profile.stats?.badges || [],
    friends: data.profile.friends || [],
    wheelSpun: Boolean(data.profile.wheel_spun),
    wheelSpunAt: data.profile.wheel_spun_at || undefined,
    capsulesOpened: data.activity?.capsulesOpened || 0,
    messagesSent: data.activity?.messagesSent || 0,
    completedTrades: data.activity?.completedTrades || 0,
    trainScore: data.mine?.total_tokens_mined || 0,
    exploreBeta: Boolean(data.profile.stats?.exploreBeta),
    chatMutedUntil: data.profile.stats?.chatMutedUntil || undefined,
    createdAt: data.profile.created_at || undefined,
    lockedBlooks: Array.isArray(data.profile.stats?.lockedBlooks) ? data.profile.stats.lockedBlooks : [],
    wishlist: Array.isArray(data.profile.stats?.wishlist) ? data.profile.stats.wishlist : [],
  };
}


const bundleEntries = (bundle: MaterialBundle) => Object.entries(bundle);
const MAX_MARKETPLACE_PRICE = 2147483647;




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


const upgrades = [
  { name: "Basic Rock", art: "/assets/basic-rock.svg", cost: 0 },
  { name: "Topaz Pick", art: "/assets/topaz-rock.svg", cost: 250 },
  { name: "Diamond Pick", art: "/assets/diamond-rock.svg", cost: 750 },
  { name: "Emerald Pick", art: "/assets/emerald-rock.svg", cost: 1500 },
  { name: "Gold Pick", art: "/assets/gold-rock.svg", cost: 3000 },
];
const mineCapFor = (pickaxe: number) => [500, 1500, 2500, 3500, 4250, 5000][pickaxe] || 5000;

// Pack opening timeline (ms): the bag pops in, then drops off the screen, then the result shows.
const REVEAL_DROP_AT_MS = 1500;
const REVEAL_DONE_AT_MS = 2700;
// Auto open keeps going until Bread Bucks run out or the player stops it; these are only safety caps.
const AUTO_OPEN_LIMIT = 1000;
const AUTO_OPEN_GUEST_LIMIT = 100;

// Give up on a stuck login instead of leaving the button hanging forever.
const AUTH_TIMEOUT_MS = 25000;
const UPDATING_MESSAGE = "🔨 Quick maintenance: Breadlet is updating right now. Try again in a minute.";

function MainPage() {
  const [player, setPlayer] = useState<Player | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [guestProgressUnlocked, setGuestProgressUnlocked] = useState(false);
  const [guestWelcomeOpen, setGuestWelcomeOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const resetClickCountRef = useRef(0);
  const pendingGuestRef = useRef<Player | null>(null);
  const playerSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const gameplayBusyRef = useRef(false);
  const autoRef = useRef(false);
  const quickRef = useRef(false);
  const revealClickRef = useRef<(() => void) | null>(null);
  const latestPlayerRef = useRef<Player | null>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [authFeedback, setAuthFeedback] = useState("");
  const [supabaseClient] = useState(() => createSupabaseClient());
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [forgotPassword, setForgotPassword] = useState(false);
  const [tab, setTab] = useState<Tab>("profile");
  const [notice, setNotice] = useState("");
  const [playerNotifications, setPlayerNotifications] = useState<PlayerNotification[]>([]);
  const seenNotificationIds = useRef(new Set<string>());
  const [inboxToast, setInboxToast] = useState<{ type: string; title: string; message: string } | null>(null);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [onlineProfileIds, setOnlineProfileIds] = useState<string[]>([]);
  const [onlinePlayers, setOnlinePlayers] = useState<{ id: string; username: string; equippedBlook: string }[]>([]);
  const [presenceReady, setPresenceReady] = useState(false);
  const { emojis: customEmojis, canManage: canManageEmojis, reload: reloadEmojis } = useCustomEmojis(Boolean(supabaseClient) && !isGuest && Boolean(player));
  // { full: true } also reloads the profile counts and Bazaar listings (see playerFromServer).
  const refreshPlayerFromServer = useCallback(async (options?: { full?: boolean }) => {
    const refreshed = await fetch(options?.full === true ? "/api/player?full=1" : "/api/player", { cache: "no-store" }).catch(() => null);
    if (refreshed?.ok) setPlayer(playerFromServer(await refreshed.json()));
  }, []);
  const [viewedProfile, setViewedProfile] = useState<PublicProfile | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [tradeDoneNotice, setTradeDoneNotice] = useState("");
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
  const [stockOddsOpen, setStockOddsOpen] = useState(false);
  // Quick open (faster animation) and auto open (keeps opening until out of Bread Bucks or stopped).
  const [quickOpen, setQuickOpen] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);
  const [autoCount, setAutoCount] = useState<number | null>(null);
  quickRef.current = quickOpen;
  latestPlayerRef.current = player;
  useEffect(() => {
    try { setQuickOpen(window.localStorage.getItem("breadlet-quick-open") === "1"); } catch {}
  }, []);
  const setQuickOpenSaved = (value: boolean) => {
    setQuickOpen(value);
    try { window.localStorage.setItem("breadlet-quick-open", value ? "1" : "0"); } catch {}
  };
  const [pendingDismantle, setPendingDismantle] = useState<string | null>(null);
  const [craftReveal, setCraftReveal] = useState<{ name: string; ingredients: MaterialBundle; phase: "processing" | "charging" | "output" } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [giftChatNotice, setGiftChatNotice] = useState("");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [maintenanceBypassed, setMaintenanceBypassed] = useState(false);
  const [maintenanceModeActive, setMaintenanceModeActive] = useState(FORCE_MAINTENANCE);
  const [maintenanceCodeInput, setMaintenanceCodeInput] = useState("");
  const [maintenanceError, setMaintenanceError] = useState("");
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    if (!player || isGuest) {
      setPlayerNotifications([]);
      return;
    }
    let firstLoad = true;
    const load = () => fetch("/api/notifications", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : [])
      .then((rows) => {
        if (!Array.isArray(rows)) return;
        const fresh = rows.filter((row) => !seenNotificationIds.current.has(row.id));
        rows.forEach((row) => seenNotificationIds.current.add(row.id));
        if (fresh.some((row) => row.type === "admin_gift" || row.type === "bazaar_sale" || row.type === "trade_completed" || row.type === "referral")) void refreshPlayerFromServer();
        // Mentions, sales and trades: a toast and chime for new ones (one summary on page load).
        const settings = readSettings();
        const freshInbox = fresh.filter((row) => isInboxType(row.type) && (row.type !== "mention" || settings.chatMentions) && (row.type !== "trade_completed" || settings.tradeOffers));
        if (freshInbox.length) {
          const latest = freshInbox[freshInbox.length - 1];
          if (settings.popups) setInboxToast(firstLoad && freshInbox.length > 1
            ? { type: "summary", title: `You have ${freshInbox.length} new notifications`, message: "Click here to open your Inbox." }
            : { type: latest.type, title: latest.payload.title || "New notification", message: latest.payload.message || "" });
          if (settings.sounds) playChime();
        }
        firstLoad = false;
        setPlayerNotifications(rows);
      })
      .catch(() => undefined);
    void load();
    // Every 60s (was 20s) to go easy on the database's disk budget.
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 60000);
    return () => window.clearInterval(timer);
  }, [isGuest, player?.id, refreshPlayerFromServer]);

  useEffect(() => {
    if (!inboxToast) return;
    const timer = window.setTimeout(() => setInboxToast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [inboxToast]);

  // Pop-ups are only for notifications outside the Inbox (admin gifts, Breadlet swaps).
  const popupNotifications = playerNotifications.filter((item) => !isInboxType(item.type));
  const inboxUnreadCount = playerNotifications.filter((item) => isInboxType(item.type)).length;

  const markNotificationsRead = async (body: { id: string } | { all: true }) => {
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => undefined);
    setPlayerNotifications((notifications) => "all" in body ? notifications.filter((item) => !isInboxType(item.type)) : notifications.filter((item) => item.id !== body.id));
  };

  const dismissPlayerNotification = async () => {
    const current = popupNotifications[0];
    if (current) await markNotificationsRead({ id: current.id });
  };

  useEffect(() => {
    if (!userMenuOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!userMenuRef.current?.contains(event.target as Node)) setUserMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [userMenuOpen]);

  // Tells the update-recovery script in layout.tsx that the game's scripts loaded and React is running.
  useEffect(() => {
    (window as Window & { __breadletReady?: boolean }).__breadletReady = true;
    try { window.sessionStorage.removeItem("breadlet-update-reloads"); } catch {}
  }, []);

  useEffect(() => {
    const restoreGuest = () => {
      const persistentGuest = window.localStorage.getItem(guestPlayerKey);
      const savedGuest = persistentGuest || window.sessionStorage.getItem(guestSessionPlayerKey);
      if (!savedGuest) return false;
      setPlayer(JSON.parse(savedGuest));
      setIsGuest(true);
      setGuestProgressUnlocked(Boolean(persistentGuest));
      return true;
    };
    if (supabaseClient) {
      // getSession reads the saved session locally (no network); /api/player then verifies it,
      // with a time limit so a slow login server can't leave the loading screen up forever.
      // getSession can wait on the network to refresh an old token; never let it hang startup.
      // If it's slow, ask /api/player anyway: it reads the login cookie on the server.
      const slowSession = new Promise<{ data: { session: unknown } }>((resolve) => window.setTimeout(() => resolve({ data: { session: "unknown" } }), 8000));
      Promise.race([supabaseClient.auth.getSession(), slowSession]).then(async ({ data }) => {
        if (!data.session) {
          restoreGuest();
          return;
        }
        // A hiccup (e.g. the site restarting during a deploy) must not look like being signed out:
        // retry, and only show the login screen when the server actually says the session is gone.
        let response: Response | null = null;
        for (let attempt = 0; attempt < 4; attempt += 1) {
          if (attempt) await new Promise((resolve) => window.setTimeout(resolve, attempt * 2000));
          response = await fetch("/api/player?full=1", { signal: AbortSignal.timeout(12000) }).catch(() => null);
          if (response?.ok || response?.status === 401) break;
        }
        if (response?.ok) {
          setIsGuest(false);
          setPlayer(playerFromServer(await response.json()));
          return;
        }
        if (response?.status !== 401) setNotice("Breadlet couldn't load your account right now. Refresh the page in a moment; you're still logged in.");
        restoreGuest();
      }).catch(() => restoreGuest()).finally(() => setBooting(false));
      return;
    }
    setBooting(false);
    if (restoreGuest()) return;
    const saved = window.localStorage.getItem(playerKey);
    if (saved) {
      const old = JSON.parse(saved);
      if (old.password)
        (() => {
          const inventory = (old.inventory || []).map((name: string) => name === "Surgeon" ? "Doctor" : name);
        setPlayer({
          listings: [],
          pickaxe: 0,
          clanTag: "",
          ...old,
          tokens: old.tokens || 0,
          inventory,
          equipped: String(old.equipped || "").replace(/^Shiny /, "").replace(/^Surgeon$/, "Doctor"),
          materials: { ...emptyMaterials(), ...(old.materials || {}) },
          badges: old.badges || [],
          friends: old.friends || [],
          wheelSpun: false,
        });
        })();
    }
  }, [supabaseClient]);
  useEffect(() => {
    // Mirror the device ID cookie into localStorage so clearing cookies doesn't make a "new" device.
    try {
      const cookieId = document.cookie.match(/(?:^|; )breadlet_device=([0-9a-f-]{36})/i)?.[1];
      const savedId = window.localStorage.getItem("breadlet-device");
      if (savedId && /^[0-9a-f-]{36}$/i.test(savedId) && savedId !== cookieId) document.cookie = `breadlet_device=${savedId}; path=/; max-age=315360000; samesite=lax`;
      else if (!savedId && cookieId) window.localStorage.setItem("breadlet-device", cookieId);
    } catch {}
  }, []);
  useEffect(() => {
    if (!supabaseClient) return;
    fetch("/api/admin").then((response) => setAdminUnlocked(response.ok)).catch(() => setAdminUnlocked(false));
  }, [supabaseClient]);
  useEffect(() => {
    if (!supabaseClient || !player?.id || isGuest) {
      setOnlinePlayers([]);
      setOnlineProfileIds([]);
      setPresenceReady(false);
      return;
    }
    setPresenceReady(false);
    const channel = supabaseClient.channel("breadlet-online", { config: { presence: { key: player.id } } });
    const syncPresence = () => {
      const state = channel.presenceState<{ profileId: string; username: string; equippedBlook: string }>();
      const uniquePlayers = new Map<string, { id: string; username: string; equippedBlook: string }>();
      Object.values(state).flat().forEach((entry) => {
        if (entry.profileId) uniquePlayers.set(entry.profileId, { id: entry.profileId, username: entry.username, equippedBlook: entry.equippedBlook || "" });
      });
      const next = Array.from(uniquePlayers.values());
      setOnlinePlayers(next);
      setOnlineProfileIds(next.map((entry) => entry.id));
      setPresenceReady(true);
    };
    channel.on("presence", { event: "sync" }, syncPresence).subscribe((status) => {
      if (status === "SUBSCRIBED") void channel.track({ profileId: player.id, username: player.username, equippedBlook: player.equipped || "" });
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setPresenceReady(true);
    });
    const timeout = window.setTimeout(() => setPresenceReady(true), 3000);
    return () => {
      window.clearTimeout(timeout);
      void supabaseClient.removeChannel(channel);
      setOnlinePlayers([]);
      setOnlineProfileIds([]);
    };
  }, [isGuest, player?.equipped, player?.id, player?.username, supabaseClient]);
  // Most-players-online record: report who's online only when it beats the record we know of,
  // at most once every 30s, so this costs almost nothing.
  const knownOnlineRecord = useRef<number | null>(null);
  const lastRecordReport = useRef(0);
  useEffect(() => {
    if (!player?.id || isGuest) return;
    fetch("/api/online-record", { cache: "no-store" }).then((response) => (response.ok ? response.json() : null)).then((data) => {
      if (data) knownOnlineRecord.current = Number(data.record) || 0;
    }).catch(() => undefined);
  }, [isGuest, player?.id]);
  useEffect(() => {
    if (knownOnlineRecord.current === null || onlinePlayers.length <= knownOnlineRecord.current || Date.now() - lastRecordReport.current < 30000) return;
    lastRecordReport.current = Date.now();
    fetch("/api/online-record", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: onlinePlayers.map((entry) => entry.id) }) })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (data) knownOnlineRecord.current = Number(data.record) || knownOnlineRecord.current; })
      .catch(() => undefined);
  }, [onlinePlayers]);
  useEffect(() => {
    const logo = document.querySelector('header img[alt="Breadlet logo"]');
    if (!logo) return;
    const goToProfile = () => setTab("wheel");
    logo.addEventListener("click", goToProfile);
    return () => logo.removeEventListener("click", goToProfile);
  }, []);
  const save = (next: Player, options: { inventory?: boolean } = {}): Promise<boolean> => {
    setPlayer(next);
    if (isGuest) {
      if (guestProgressUnlocked) {
        window.localStorage.setItem(guestPlayerKey, JSON.stringify(next));
      } else {
        window.sessionStorage.setItem(guestSessionPlayerKey, JSON.stringify(next));
      }
      return Promise.resolve(true);
    }
    if (supabaseClient) {
      const currentSave = playerSaveQueueRef.current.catch(() => undefined).then(async () => {
        try {
        const payloadPlayer = { equipped: next.equipped };
        const response = await fetch("/api/player", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ player: payloadPlayer }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          setNotice(body?.error || "Could not save your player data.");
          return false;
        }
        const savedPlayer = await response.json();
        setPlayer(playerFromServer(savedPlayer));
        return true;
        } catch {
          setNotice("Could not reach the save service. Your latest changes are still on screen; retry before refreshing.");
          return false;
        }
      });
      playerSaveQueueRef.current = currentSave.then(() => undefined);
      return currentSave;
    }
    window.localStorage.setItem(playerKey, JSON.stringify(next));
    return Promise.resolve(true);
  };
  const playAction = async (action: Record<string, unknown>) => {
    if (gameplayBusyRef.current) {
      setNotice("Your previous action is still processing.");
      return null;
    }
    gameplayBusyRef.current = true;
    try {
      await playerSaveQueueRef.current;
      const response = await fetchGameplayApi({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) });
      const result = await response.json();
      if (!response.ok) {
        setNotice(result.error || "Gameplay action failed.");
        return null;
      }
      setPlayer(playerFromServer(result.player));
      return result as { results: { capsule: string; reward: Reward }[]; crateReward?: (typeof wheelRewards)[number]; tokensEarned: number };
    } catch {
      setNotice("Could not reach the gameplay server. Refresh before retrying.");
      return null;
    } finally {
      gameplayBusyRef.current = false;
    }
  };
  const claimTedSecret = async (): Promise<{ triggered: boolean; claimed: boolean } | null> => {
    if (!player) return null;
    try {
      if (isGuest) {
        if (player.inventory.includes("Ted")) return { triggered: true, claimed: false };
        const saved = await save({ ...player, inventory: [...player.inventory, "Ted"] }, { inventory: true });
        return saved ? { triggered: true, claimed: true } : null;
      }
      const response = await fetchSecretApi({ method: "POST" });
      const result = await response.json();
      if (!response.ok) {
        setNotice(result.error || "Could not claim Ted.");
        return null;
      }
      if (result.claimed && result.player) setPlayer(playerFromServer(result.player));
      return { triggered: Boolean(result.triggered), claimed: Boolean(result.claimed) };
    } catch {
      setNotice("Could not claim Ted. Please try again.");
      return null;
    }
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
      try {
        await finishAccountLogin();
      } catch {
        setNotice(UPDATING_MESSAGE);
      }
      return;
    }
    async function finishAccountLogin() {
      let result: { error: { message: string } | null; data?: { session?: unknown } };
      if (authMode === "signup") {
        const signupResponse = await fetch("/api/auth/signup", {
          method: "POST",
          signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), username: username.trim(), password, referralCode: referralCode.trim() }),
        });
        const signupBody = await signupResponse.json().catch(() => null);
        if (!signupResponse.ok) {
          result = { error: { message: signupBody?.error || (signupResponse.status >= 500 ? UPDATING_MESSAGE : "Could not create your account.") } };
        } else {
          const loginResponse = await fetch("/api/auth/login", {
            method: "POST",
            signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: username.trim(), password }),
          });
          const loginBody = await loginResponse.json().catch(() => null);
          result = { error: loginResponse.ok ? null : { message: loginBody?.error || "Account created, but automatic login failed." } };
        }
      } else {
        const loginResponse = await fetch("/api/auth/login", {
          method: "POST",
          signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: username.trim(), password }),
        });
        const loginBody = await loginResponse.json().catch(() => null);
        // A 5xx with no JSON body means the server is restarting for an update, not a wrong password.
        result = { error: loginResponse.ok ? null : { message: loginBody?.error || (loginResponse.status >= 500 ? UPDATING_MESSAGE : "Log in failed. Check your username and password, then try again.") } };
      }
      if (result.error) {
        setNotice(result.error.message);
        return;
      }
      await fetch("/api/player", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: username.trim(), tokens: 1000, materials: emptyMaterials() }) }).catch(() => null);
      // Retry while the server finishes restarting instead of silently doing nothing.
      let response: Response | null = null;
      for (let attempt = 0; attempt < 4 && !response?.ok; attempt += 1) {
        if (attempt) await new Promise((resolve) => window.setTimeout(resolve, attempt * 2000));
        response = await fetch("/api/player?full=1", { signal: AbortSignal.timeout(12000) }).catch(() => null);
      }
      if (response?.ok) {
        pendingGuestRef.current = null;
        setIsGuest(false);
        setPlayer(playerFromServer(await response.json()));
        setViewedProfile(null);
        setNotice("");
        setTourOpen(true);
      } else setNotice(UPDATING_MESSAGE);
      return;
    }
    const firstFiftyCount = Number(window.localStorage.getItem(firstFiftyKey) || "0");
    const badges = firstFiftyCount < 50 ? ["First 50"] : [];
    window.localStorage.setItem(firstFiftyKey, String(Math.min(50, firstFiftyCount + 1)));
    save({
      username: username.trim(),
      password,
      tokens: 1000,
      mined: 0,
      inventory: [],
      equipped: "",
      pickaxe: 0,
      listings: [],
      clanTag: "",
      materials: emptyMaterials(),
      badges,
      friends: [],
      wheelSpun: false,
    });
    setIsGuest(false);
    setViewedProfile(null);
    setNotice("");
    setTourOpen(true);
  };
  const startGuest = () => {
    const persistentGuest = window.localStorage.getItem(guestPlayerKey);
    const savedGuest = persistentGuest || window.sessionStorage.getItem(guestSessionPlayerKey);
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
      tokens: 1000,
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
    setNotice("");
    setGuestWelcomeOpen(true);
    if (guestProgressUnlocked) {
      window.localStorage.setItem(guestPlayerKey, JSON.stringify(guestPlayer));
    } else {
      window.sessionStorage.setItem(guestSessionPlayerKey, JSON.stringify(guestPlayer));
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
    const result = await response.json().catch(() => ({}));
    setNotice(result.relation === "friends" ? `You and ${match.username} are now friends!` : `Friend request sent to ${match.username}.`);
  };
  const openPlayerProfile = async (username: string) => {
    if (!player || username.toLowerCase() === player.username.toLowerCase()) {
      setViewedProfile(null);
      setTab("profile");
      return;
    }
    const response = await fetch(`/api/players/search?q=${encodeURIComponent(username)}`, { cache: "no-store" });
    const matches = response.ok ? await response.json().catch(() => []) : [];
    const profile = Array.isArray(matches) ? matches.find((candidate: PublicProfile) => candidate.username.toLowerCase() === username.toLowerCase()) : null;
    if (!profile) {
      setNotice("That player's profile could not be loaded.");
      return;
    }
    setViewedProfile(profile);
    setTab("profile");
  };
  const spinWheel = async (): Promise<(typeof wheelRewards)[number] | null> => {
    if (!player) return null;
    if (!isGuest) return (await playAction({ action: "crate" }))?.crateReward || null;
    let roll = Math.random() * wheelRewards.reduce((total, entry) => total + entry.chance, 0);
    const reward = wheelRewards.find((entry) => { roll -= entry.chance; return roll < 0; }) || wheelRewards[0];
    const nextMaterials = { ...player.materials };
    if (reward.type === "material" && reward.material) {
      nextMaterials[reward.material] = (nextMaterials[reward.material] || 0) + reward.amount;
    }
    const nextPlayer = {
      ...player,
      tokens: reward.type === "tokens" ? player.tokens + reward.amount : player.tokens,
      materials: nextMaterials,
      wheelSpun: !isGuest,
    };
    await save(nextPlayer);
    return reward;
  };
  // How long each step of the pack opening lasts (ms); Quick open makes it much shorter.
  const revealTimes = () => quickRef.current
    ? { drop: 500, done: 1000, dwell: 450 }
    : { drop: REVEAL_DROP_AT_MS, done: REVEAL_DONE_AT_MS, dwell: 1500 };
  // Plays the bag animation. Resolves once it's dismissed: by a click, or by itself during auto open.
  const playReveal = (capsule: Capsule, reward: Reward) => new Promise<void>((resolve) => {
    const timers: number[] = [];
    const times = revealTimes();
    let phase: "charging" | "spinning" | "result" = "charging";
    const setPhase = (next: typeof phase) => {
      phase = next;
      setReveal((current) => (current ? { ...current, phase: next } : null));
    };
    const finish = () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      revealClickRef.current = null;
      setReveal(null);
      resolve();
    };
    // A click skips ahead to the result, then closes it. During auto open it stops auto open.
    revealClickRef.current = () => {
      if (autoRef.current) {
        autoRef.current = false;
        finish();
        return;
      }
      if (phase !== "result") {
        timers.forEach((timer) => window.clearTimeout(timer));
        setPhase("result");
        return;
      }
      finish();
    };
    setReveal({ capsule, reward, track: [], winnerIndex: 0, phase: "charging" });
    timers.push(window.setTimeout(() => setPhase("spinning"), times.drop));
    timers.push(window.setTimeout(() => {
      setPhase("result");
      if (autoRef.current) timers.push(window.setTimeout(finish, times.dwell));
    }, times.done));
  });
  const openCapsule = async (capsule: Capsule): Promise<boolean> => {
    const current = latestPlayerRef.current;
    if (!current) return false;
    if (isSeasonalPackLocked(capsule.name)) {
      setNotice(`The ${capsule.name} opens on ${opensOnLabel(capsule.name)}.`);
      return false;
    }
    if (!isMarketPackInStock(capsule.name)) {
      setNotice(`${capsule.name} is out of stock. Check back after the next hourly refresh.`);
      return false;
    }
    if (!isGuest) {
      const result = await playAction({ action: "open", quantities: { [capsule.name]: 1 } });
      const reward = result?.results[0]?.reward;
      if (!reward) return false;
      await playReveal(capsule, reward);
      return true;
    }
    const total = capsule.pool.reduce((sum, reward) => sum + chanceFor(capsule, reward), 0);
    let roll = Math.random() * total;
    const reward = capsule.pool.find((item) => {
      const chance = chanceFor(capsule, item);
      roll -= chance;
      return chance > 0 && roll <= 0;
    }) || capsule.pool[0];
    const finalReward = { ...reward, name: shinyNameFor(reward.name) };
    const saved = await save({ ...current, inventory: [...current.inventory, finalReward.name] }, { inventory: true });
    if (!saved) return false;
    await playReveal(capsule, finalReward);
    return true;
  };
  // Opens the same pack again and again until Bread Bucks run out, it sells out, or the player clicks.
  const startAutoOpen = async (capsule: Capsule) => {
    if (autoRef.current) return;
    autoRef.current = true;
    setAutoOpen(true);
    setAutoCount(0);
    let opened = 0;
    let reason = "";
    let failed = false;
    while (autoRef.current) {
      const current = latestPlayerRef.current;
      if (!current) break;
      if (!isMarketPackInStock(capsule.name)) { reason = `${capsule.name} sold out`; break; }
      if (!isGuest && current.tokens < capsule.price) { reason = "you ran out of Bread Bucks"; break; }
      if (opened >= (isGuest ? AUTO_OPEN_GUEST_LIMIT : AUTO_OPEN_LIMIT)) { reason = "that's the most for one session"; break; }
      if (!(await openCapsule(capsule))) { failed = true; break; }
      opened += 1;
      setAutoCount(opened);
    }
    reason = reason || (autoRef.current ? "" : "you stopped it");
    autoRef.current = false;
    setAutoOpen(false);
    setAutoCount(null);
    // When an open itself failed, its own error message is already showing.
    if (!failed) setNotice(`Auto open stopped${reason ? `: ${reason}` : ""}. Opened ${opened} bag${opened === 1 ? "" : "s"}.`);
  };
  // Keyboard shortcuts (desktop): 1-8 switch tabs, Esc closes the top pop-up, Space on Ted's Shop
  // opens the last bag again (still asking to confirm). Ignored while typing.
  const shortcutTabsRef = useRef<Tab[]>([]);
  const lastShopCapsuleRef = useRef<Capsule | null>(null);
  const shortcutStateRef = useRef({ tab: "" as Tab | "", busy: false, auto: false });
  const openShopCapsuleRef = useRef<(capsule: Capsule) => void>(() => undefined);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      const modal = Array.from(document.querySelectorAll<HTMLElement>(".modal-layer")).pop();
      if (event.key === "Escape" && modal) {
        const close = Array.from(modal.querySelectorAll<HTMLButtonElement>("button")).find((button) => /close|cancel/i.test(button.getAttribute("aria-label") || "") || ["Close", "×", "Cancel"].includes(button.textContent?.trim() || ""));
        close?.click();
        return;
      }
      if (modal || shortcutStateRef.current.busy) return;
      if (/^[1-9]$/.test(event.key)) {
        const next = shortcutTabsRef.current[Number(event.key) - 1];
        if (next) { event.preventDefault(); setTab(next); }
        return;
      }
      if (event.key === " " && shortcutStateRef.current.tab === "capsules" && lastShopCapsuleRef.current) {
        event.preventDefault();
        openShopCapsuleRef.current(lastShopCapsuleRef.current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // Chat message to scroll to when chat opens (from an @mention in the Inbox).
  const [chatJump, setChatJump] = useState("");
  // Claim reminder: a button (and one chime) once the hourly Bread Bucks claim is ready again.
  const [claimReady, setClaimReady] = useState(false);
  const claimWasReady = useRef<boolean | null>(null);
  useEffect(() => {
    if (!player || isGuest) { setClaimReady(false); return; }
    const spunAt = player.wheelSpunAt ? new Date(player.wheelSpunAt).getTime() : 0;
    const check = () => {
      const ready = Date.now() >= spunAt + 3600000;
      // Chime only when it turns ready while playing, not on page load.
      if (ready && claimWasReady.current === false && readSettings().sounds) playChime();
      claimWasReady.current = ready;
      setClaimReady(ready);
    };
    check();
    const timer = window.setInterval(check, 15000);
    return () => window.clearInterval(timer);
  }, [player?.wheelSpunAt, isGuest, Boolean(player)]);
  // Locked Breadlets and the wishlist save to the account (guests keep them for this visit).
  const savePref = (key: "lockedBlooks" | "wishlist", list: string[]) => {
    setPlayer((current) => (current ? { ...current, [key]: list } : current));
    if (isGuest) return;
    void fetch("/api/player/prefs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [key]: list }) })
      .then(async (response) => { if (!response.ok) setNotice((await response.json().catch(() => ({}))).error || "That didn't save. Try again."); })
      .catch(() => setNotice("That didn't save. Try again."));
  };
  const toggleInList = (key: "lockedBlooks" | "wishlist", name: string) => {
    const list = player?.[key] || [];
    savePref(key, list.includes(name) ? list.filter((item) => item !== name) : [...list, name]);
  };
  const toggleLock = (name: string) => toggleInList("lockedBlooks", name);
  const toggleWish = (name: string) => toggleInList("wishlist", name);
  const withoutLocked = (quantities: Record<string, number>, verb: string) => {
    const locked = new Set(player?.lockedBlooks || []);
    const skipped = Object.keys(quantities).filter((name) => locked.has(name) && quantities[name] > 0);
    if (skipped.length) setNotice(`Skipped locked Breadlet${skipped.length === 1 ? "" : "s"}: ${skipped.join(", ")}. Unlock ${skipped.length === 1 ? "it" : "them"} to ${verb}.`);
    return Object.fromEntries(Object.entries(quantities).filter(([name]) => !locked.has(name)));
  };
  const equip = (name: string) => {
    if (player) {
      save({ ...player, equipped: name });
      setNotice(`${name} equipped.`);
    }
  };
  const sell = (name: string) => {
    if (!player || player.inventory.length <= 1) return;
    if (!isGuest) {
      void massSell({ [name]: 1 });
      return;
    }
    const index = player.inventory.indexOf(name);
    const inventory = player.inventory.filter((_, itemIndex) => itemIndex !== index);
    const value = sellValueForBlook(name, rarityFor(name));
    save({
      ...player,
      tokens: player.tokens + value,
      inventory,
      equipped: player.equipped === name ? inventory[0] : player.equipped,
    }, { inventory: true });
    setNotice(`${name} sold for ${value} Bread Bucks.`);
  };
  const massSell = async (quantities: Record<string, number>) => {
    if (!player) return false;
    const requested = Object.fromEntries(Object.entries(withoutLocked(quantities, "sell")).filter(([, quantity]) => quantity > 0));
    if (!Object.keys(requested).length) {
      setNotice("Choose at least one extra Breadlet to sell.");
      return false;
    }
    if (!isGuest) {
      const result = await playAction({ action: "sell", quantities: requested });
      if (!result) return false;
      setNotice(`Breadlets sold for ${result.tokensEarned.toLocaleString()} Bread Bucks.`);
      return true;
    }
    if (isGuest) {
      const remaining = [...player.inventory];
      let tokensEarned = 0;
      Object.entries(requested).forEach(([name, requestedAmount]) => {
        const ownedCount = remaining.filter((item) => item === name).length;
        const amount = Math.min(requestedAmount, Math.max(0, ownedCount - 1));
        for (let sold = 0; sold < amount; sold += 1) remaining.splice(remaining.indexOf(name), 1);
        tokensEarned += amount * sellValueForBlook(name, rarityFor(name));
      });
      if (!tokensEarned) return false;
      save({ ...player, tokens: player.tokens + tokensEarned, inventory: remaining }, { inventory: true });
      setNotice(`Breadlets sold for ${tokensEarned.toLocaleString()} Bread Bucks.`);
      return true;
    }
    return false;
  };
  const massDismantle = async (quantities: Record<string, number>) => {
    if (!player) return false;
    const requested = Object.fromEntries(Object.entries(withoutLocked(quantities, "recycle")).filter(([, quantity]) => quantity > 0));
    if (!Object.keys(requested).length) {
      setNotice("Choose at least one extra Breadlet to recycle.");
      return false;
    }
    if (!isGuest) {
      const result = await playAction({ action: "dismantle", quantities: requested });
      if (!result) return false;
      setNotice("Breadlets recycled into materials.");
      return true;
    }
    const remaining = [...player.inventory];
    const materials = { ...player.materials };
    let recycled = 0;
    Object.entries(requested).forEach(([name, requestedAmount]) => {
      const ownedCount = remaining.filter((item) => item === name).length;
      const amount = Math.min(requestedAmount, Math.max(0, ownedCount - 1));
      for (let count = 0; count < amount; count += 1) remaining.splice(remaining.indexOf(name), 1);
      bundleEntries(dismantleBundleFor(name, rarityFor(name))).forEach(([material, perCopy]) => {
        materials[material] = (materials[material] || 0) + perCopy * amount;
      });
      recycled += amount;
    });
    if (!recycled) return false;
    await save({ ...player, inventory: remaining, materials }, { inventory: true });
    setNotice(`${recycled} Breadlets recycled into materials.`);
    return true;
  };
  const buyUpgrade = (index: number) => {
    if (!player || index <= player.pickaxe) return;
    const upgrade = upgrades[index];
    if (!isGuest && player.tokens < upgrade.cost) {
      setNotice(`You need ${upgrade.cost} Bread Bucks for ${upgrade.name}.`);
      return;
    }
    save({ ...player, tokens: isGuest ? player.tokens : player.tokens - upgrade.cost, pickaxe: index });
    setNotice(`${upgrade.name} equipped.`);
  };
  const createListing = async (blook: string, price: number) => {
    if (
      !player ||
      !player.inventory.includes(blook) ||
      !Number.isSafeInteger(price) ||
      price > MAX_MARKETPLACE_PRICE ||
      price < 1
    ) {
      setNotice(`Choose an owned Bread and a whole-number price from 1 to ${MAX_MARKETPLACE_PRICE.toLocaleString()}.`);
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
          equipped: player.equipped === blook ? "" : player.equipped,
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
      setNotice((await res.json().catch(() => ({}))).error || "Could not create the listing.");
      return;
    }
    const listing = { id: Date.now(), seller: player.username, blook, price };
    save({ ...player, listings: [...player.listings, listing] });
    setNotice(`${blook} listed in the Bazaar.`);
  };
  const cancelListing = async (listing: Listing) => {
    if (!player || isGuest || !supabaseClient) {
      if (player) save({ ...player, listings: player.listings.filter((item) => item.id !== listing.id) });
      return;
    }
    const res = await fetch("/api/marketplace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel", listingId: listing.id }),
    });
    if (!res.ok) {
      setNotice((await res.json().catch(() => ({}))).error || "Could not take down this listing.");
      return;
    }
    const nextPlayer = { ...player, inventory: [...player.inventory, listing.blook] };
    const listRes = await fetch("/api/marketplace");
    if (listRes.ok) nextPlayer.listings = await listRes.json();
    setPlayer(nextPlayer);
    setNotice(`${listing.blook} taken down and returned to your inventory.`);
  };
  const buyListing = async (listing: Listing) => {
    if (!player) return;
    if (!isGuest && player.tokens < listing.price) {
      setNotice("You need more Bread Bucks for this listing.");
      return;
    }
    if (supabaseClient && !isGuest) {
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
      setNotice((await res.json().catch(() => ({}))).error || "Could not buy this listing.");
      return;
    }
    save({ ...player, tokens: isGuest ? player.tokens : player.tokens - listing.price, inventory: [...player.inventory, listing.blook], listings: player.listings.filter((item) => item.id !== listing.id) }, { inventory: true });
    setSelectedListing(null);
    setNotice(`${listing.blook} purchased.`);
  };
  const redeemPromo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!player || isGuest) return;
    const code = promoCode.trim();
    if (code === "Breadlet2.0") {
      const response = await fetch("/api/promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice(result.error || "Promo redemption failed.");
        return;
      }
      setPlayer((current) => current ? { ...current, tokens: current.tokens + Number(result.amount || 1000) } : current);
      setPromoCode("");
      setNotice("Promo redeemed: +1,000 Bread Bucks.");
    } else if (code.toLowerCase() === "breadletislands32") {
      const response = await fetch("/api/promo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) return setNotice(result.error || "Promo redemption failed.");
      setPlayer((current) => current ? { ...current, exploreBeta: true } : current);
      setPromoCode("");
      setTab("explore");
      // Explore stays hidden from the sidebar; entering the code is the only way in.
      setNotice("Welcome to Breadlet Explore! 🏝️");
    } else if (code === MAINTENANCE_BYPASS_CODE) {
      const unlocked = await unlockAdminWithCode(code);
      if (unlocked) {
        setTab("admin");
        setNotice("Admin access enabled.");
      } else {
        setNotice("Admin access could not be enabled. Make sure you're logged in and try again.");
      }
    } else setNotice("That promo code is not active.");
  };
  const grantReward = async (targetId: string, reward: { operation?: "add" | "remove"; tokens?: number; candy?: number; blookName?: string; badge?: string; material?: string; materialAmount?: number }) => {
    if (!adminUnlocked) return;
    const response = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetId, ...reward }) });
    if (!response.ok) return setNotice((await response.json().catch(() => null))?.error || "Admin resource update failed.");
    setNotice(reward.operation === "remove" ? "Resource removed." : "Resource added.");
  };
  const moderateAccount = async (action: "ban" | "delete", payload: Record<string, unknown>) => {
    const response = action === "delete"
      ? await fetch(`/api/admin?targetId=${encodeURIComponent(String(payload.targetId || ""))}`, { method: "DELETE" })
      : await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...payload }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setNotice(result.error || `Could not ${action} account.`);
      return false;
    }
    if (action === "delete") setNotice(`${result.username || "Account"} deleted. Its username is available again.`);
    else {
      setNotice("Ban applied. The player will see the reason when they try to log in.");
    }
    return true;
  };
  const salvage = async (name: string) => {
    if (!player || player.inventory.length <= 1) return false;
    if (!isGuest) {
      const result = await playAction({ action: "dismantle", name });
      if (!result) return false;
      setNotice(`${name} dismantled into a five-material bundle.`);
      return true;
    }
    const index = player.inventory.indexOf(name);
    if (index === -1) return false;
    const inventory = player.inventory.filter(
      (_, itemIndex) => itemIndex !== index,
    );
    const bundle = dismantleBundleFor(name, rarityFor(name));
    const saved = await save({
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
    }, { inventory: true });
    if (!saved) return false;
    setNotice(`${name} dismantled into a five-material bundle.`);
    return true;
  };
  const craft = async (name: string) => {
    const recipe = craftRecipeFor(name);
    if (!player || !recipe) return;
    if (!isGuest) {
      const result = await playAction({ action: "craft", name });
      if (!result) return;
      setCraftReveal({ name, ingredients: recipe.ingredients, phase: "processing" });
      window.setTimeout(() => setCraftReveal((current) => current ? { ...current, phase: "charging" } : null), 1400);
      window.setTimeout(() => setCraftReveal((current) => current ? { ...current, phase: "output" } : null), 2700);
      return;
    }
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
      void save({ ...next, inventory: [...next.inventory, name] }, { inventory: true }).then((saved) => {
        if (saved) setCraftReveal({ name, ingredients: recipe.ingredients, phase: "output" });
        else setCraftReveal(null);
      });
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
  useEffect(() => {
    if (window.sessionStorage.getItem(MAINTENANCE_BYPASS_KEY) === "1") {
      setMaintenanceBypassed(true);
    }
    fetch("/api/maintenance")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (data) setMaintenanceModeActive(FORCE_MAINTENANCE || Boolean(data.maintenanceMode)); })
      .catch(() => undefined);
  }, []);
  const unlockAdminWithCode = async (code: string) => {
    try {
      const response = await fetch("/api/admin/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (response.ok) {
        setAdminUnlocked(true);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };
  const submitMaintenanceBypass = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = maintenanceCodeInput.trim();
    if (code !== MAINTENANCE_BYPASS_CODE) {
      setMaintenanceError("Incorrect access code.");
      return;
    }
    window.sessionStorage.setItem(MAINTENANCE_BYPASS_KEY, "1");
    setMaintenanceBypassed(true);
    setMaintenanceError("");
    // Best-effort: grants real admin_roles access if the user already has a session.
    void unlockAdminWithCode(code);
  };
  const toggleMaintenance = async (next: boolean) => {
    const response = await fetch("/api/maintenance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ maintenanceMode: next }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setNotice(result.error || "Could not update maintenance mode.");
      return;
    }
    setMaintenanceModeActive(next);
    setNotice(`Maintenance mode ${next ? "enabled" : "disabled"}.`);
  };
  const leaveSession = () => {
    if (isGuest && player && !guestProgressUnlocked) {
      pendingGuestRef.current = player;
    }
    if (isGuest) window.sessionStorage.removeItem(guestSessionPlayerKey);
    setPlayer(null);
    setIsGuest(false);
    setUserMenuOpen(false);
    if (!isGuest) supabaseClient?.auth.signOut();
    window.localStorage.removeItem(playerKey);
  };
  if (maintenanceModeActive && !maintenanceBypassed)
    return (
      <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-[#0b1622] px-5">
        <div className="w-full max-w-sm rounded-3xl border border-[#3d91cd] bg-[#103f75] p-8 text-center shadow-2xl">
          <Hammer size={56} className="maintenance-hammer mx-auto text-[#ffe27a]" />
          <h1 className="mt-4 text-2xl font-black text-[#bde8ff]">Down for Maintenance</h1>
          <p className="mt-2 text-sm text-[#d9f3ff]">Breadlet is getting hammered on right now. Check back soon!</p>
          <form onSubmit={submitMaintenanceBypass} className="mt-6 space-y-3">
            <input
              type="password"
              value={maintenanceCodeInput}
              onChange={(event) => setMaintenanceCodeInput(event.target.value)}
              placeholder="Admin access code"
              autoComplete="off"
              className="w-full rounded-xl border border-[#3d91cd]/50 bg-[#0b2a4d] px-4 py-3 text-sm text-white placeholder:text-[#6ea3ce] focus:outline-none"
            />
            {maintenanceError && <p className="text-xs font-bold text-red-300">{maintenanceError}</p>}
            <button type="submit" className="w-full rounded-2xl bg-[#39a8f5] px-4 py-3 font-black text-[#031426] transition hover:bg-[#73c8ff]">
              Enter
            </button>
          </form>
        </div>
      </div>
    );
  if (!player && booting) return <BootScreen />;
  if (!player)
    return (
      <LoginScreen
        username={username}
        email={email}
        password={password}
        setUsername={setUsername}
        setEmail={setEmail}
        referralCode={referralCode}
        setReferralCode={setReferralCode}
        setPassword={setPassword}
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
    {
      id: "capsules",
      label: "Goodybags",
      icon: <Store size={20} strokeWidth={2.2} />,
    },
    {
      id: "inventory",
      label: "Breadlets",
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
    { id: "leaderboard", label: "Leaderboard", icon: <Crown size={20} strokeWidth={2.2} /> },
  ];
  const visibleNav = isGuest
    ? nav.filter((item) => !["clan", "market", "chat", "leaderboard"].includes(item.id))
    : nav;
  shortcutTabsRef.current = visibleNav.map((item) => item.id);
  openShopCapsuleRef.current = (capsule) => { if (autoOpen) void startAutoOpen(capsule); else setCapsuleToConfirm(capsule); };
  shortcutStateRef.current = { tab, busy: Boolean(reveal) || autoCount !== null, auto: autoOpen };
  return (
    <main className="breadlet-blue-theme min-h-screen bg-[#0c3b70] text-white flex flex-col md:h-screen md:overflow-hidden md:flex-row">
      {/* Left Blooket-style Persistent Sidebar */}
      <aside className="breadlet-sidebar w-full md:w-60 md:h-screen md:overflow-y-auto shrink-0 border-r border-[#3d91cd]/30 bg-[#072a54] p-3 flex flex-col justify-between z-20 shadow-xl">
        <div>
          {/* Logo Header */}
          <button type="button" className="sidebar-brand" data-tour-target="profile" aria-label="Open my profile" onClick={() => { setViewedProfile(null); setTab("profile"); }}>
            <span className="sidebar-wordmark"><img src="/assets/breadlet-logo-2.svg" alt="Breadlet" /></span>
          </button>

          {/* Sidebar Nav Buttons */}
          <nav className="-mt-3 space-y-1.5">
            {visibleNav.map((item) => (
              <button
                key={item.id}
                data-tour-target={item.id}
                onClick={() => setTab(item.id)}
                aria-current={tab === item.id ? "page" : undefined}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 font-extrabold text-sm transition ${
                  tab === item.id
                    ? "bg-[#39a8f5] text-white shadow-md"
                    : "text-[#9cc8e8] hover:bg-[#103f75] hover:text-white"
                }`}
              >
                {item.icon}
                <span className="flex min-w-0 flex-col items-start leading-none"><span>{item.label}</span></span>
                {item.id === "profile" && inboxUnreadCount > 0 && <span className="nav-unread-badge" aria-label={`${inboxUnreadCount} unread in your Inbox`}>{inboxUnreadCount > 9 ? "9+" : inboxUnreadCount}</span>}
              </button>
            ))}
          </nav>
        </div>

        {tradeDoneNotice && (
          <div role="status" className="mt-4 rounded-xl border border-white/15 bg-black p-3 text-sm text-white shadow-lg">
            <p className="font-black">Trade completed</p>
            <p className="mt-1 text-white/75">Your trade with <b>{tradeDoneNotice}</b> went through.</p>
            <button type="button" onClick={() => setTradeDoneNotice("")} className="mt-2 w-full rounded-lg bg-white/10 px-2 py-1 text-xs font-bold hover:bg-white/20">Dismiss</button>
          </div>
        )}

        {/* Sidebar Footer Controls */}
        <div className="sidebar-footer mt-auto flex items-center justify-center gap-7 bg-[#13120F] py-4 text-white">
          <a title="GitHub" href="https://github.com/pretendbreadkid-byte/Breadlet/tree/master" target="_blank" rel="noreferrer" className="hover:text-[#bde8ff] transition"><GitBranch size={18} /></a>
          <a title="YouTube" href="https://www.youtube.com/@Breadblook" target="_blank" rel="noreferrer" className="hover:text-[#bde8ff] transition"><CirclePlay size={18} /></a>
          <a title="Discord" href="https://discord.gg/ENBbs6ewb" target="_blank" rel="noreferrer" className="hover:text-[#bde8ff] transition"><MessageCircle size={18} /></a>
          <button title={isGuest ? "End guest session" : "Log out"} onClick={leaveSession} className="hover:text-red-300 transition"><LogOut size={20} /></button>
        </div>
      </aside>

      {/* Main Workspace Column */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen md:h-screen md:min-h-0 md:overflow-y-auto">
        {/* Top Header Bar */}
        <div className="workspace-island pointer-events-none fixed right-3 top-3 z-30 flex w-fit max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-2xl border border-[#3d91cd]/50 bg-[#103f75] px-2 py-2 shadow-xl sm:right-5 sm:top-5 sm:gap-3 sm:px-3">
          <div className="workspace-summary flex min-w-0 items-center gap-2 sm:gap-4">
            {/* Tokens Balance Counter */}
            <div className="workspace-tokens flex items-center gap-2 font-black text-[#ffe2a0]" aria-label={`${player.tokens.toLocaleString()} Bread Bucks`}>
              <img src="/assets/Bread%20bucks.svg" alt="" className="h-8 w-8" />
              <span className="text-xl">{player.tokens.toLocaleString()}</span>
            </div>

            {tab === "crafting" && (
              <div className="workspace-materials" aria-label="Crafting materials">
                {materialNames.map((material) => (
                  <span key={material} className="workspace-material" title={`${material}: ${player.materials[material] || 0}`}>
                    <img src={materialArtFor(material)} alt="" />
                    <span>{player.materials[material] || 0}</span>
                    <span className="sr-only">{material}</span>
                  </span>
                ))}
              </div>
            )}

            {/* Corner Username Dropdown */}
            <div ref={userMenuRef} className="workspace-account relative pointer-events-auto">
              <button
                onClick={() => setUserMenuOpen((prev) => !prev)}
                className="workspace-account-button flex max-w-[calc(100vw-8rem)] items-center gap-2 rounded-xl border border-[#3c3a34] bg-[#13120F] px-2 py-2 font-black text-[#e9bd67] transition hover:bg-[#27251F] sm:max-w-none sm:gap-2.5 sm:px-3.5"
              >
                <div className="flex h-6 w-6 items-center justify-center overflow-hidden">
                  {player.equipped ? <BlookImg name={player.equipped} className="h-full w-full" /> : <img src="/assets/breadlet-logo.svg" alt="" className="h-full w-full object-contain" />}
                </div>
                <span title={player.username} className="min-w-0 max-w-[min(52vw,22rem)] whitespace-normal break-words text-left leading-tight [overflow-wrap:anywhere] sm:max-w-[24rem]">{player.username}</span>
                <ChevronDown size={18} />
              </button>

              {userMenuOpen && (
                <div className="workspace-account-menu absolute right-0 z-50 mt-2 max-h-[calc(100vh-6rem)] w-56 overflow-y-auto rounded-2xl border border-[#3c3a34] bg-[#13120F] p-2 shadow-2xl">
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
                      setTab("resources");
                      setUserMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-[#bde8ff] hover:bg-[#18558f]"
                  >
                    <Info size={18} />
                    Resources
                  </button>
                  <button
                    onClick={() => {
                      setTab("settings");
                      setUserMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-[#bde8ff] hover:bg-[#18558f]"
                  >
                    <Info size={18} />
                    Settings
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
                  {!isGuest && <button onClick={() => { setViewedProfile(null); setUserMenuOpen(false); setTourOpen(true); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold"><HelpCircle size={18} />Take a tour</button>}
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
        <section data-tab={tab} className={`game-workspace flex-1 overflow-y-auto px-6 pb-6 pt-36 ${tab === "chat" ? "chat-workspace" : ""}`}>
          {tab !== "capsules" && <BreadDrift className="page-drift" />}
          {player && !isGuest && <CoinFlipPopup onFinished={refreshPlayerFromServer} />}
          {player && !isGuest && <AdminEventsLayer onReward={refreshPlayerFromServer} />}
          {player && <LiveTrade player={player} isGuest={isGuest} onlineProfileIds={onlineProfileIds} presenceReady={presenceReady} onlinePlayers={onlinePlayers} artFor={artFor} BlookArt={BlookImg} emojis={customEmojis} canManageEmojis={canManageEmojis} reloadEmojis={reloadEmojis} onPlayerRefresh={refreshPlayerFromServer} notify={setNotice} onTradeComplete={setTradeDoneNotice} />}
          {isGuest && <div className="guest-mode-banner mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm"><span>Guest mode · all game actions are free · {guestProgressUnlocked ? "progress saves in this browser" : "progress lasts until you end this session"}</span><button onClick={leaveSession} className="font-black underline underline-offset-4">{guestProgressUnlocked ? "Exit guest" : "End session"}</button></div>}
          {notice && (
            <div className="modal-layer fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 px-5 backdrop-blur-sm">
              <div className="w-full max-w-sm rounded-3xl border border-[#3d91cd] bg-[#103f75] p-6 text-center shadow-2xl">
                <p className="text-xl font-black text-[#bde8ff]">Breadlet Update</p>
                <p className="mt-3 text-sm text-[#d9f3ff]">{notice}</p>
                <button onClick={() => setNotice("")} className="mt-6 w-full rounded-2xl bg-[#39a8f5] px-4 py-3 font-black text-[#031426] hover:bg-[#73c8ff] shadow-md transition">Close</button>
              </div>
            </div>
          )}
          {!notice && popupNotifications[0] && (
            <div className="modal-layer fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 px-5 backdrop-blur-sm">
              <div className="w-full max-w-sm rounded-3xl border border-cyan-300/60 bg-[#103f75] p-6 text-center shadow-2xl">
                <p className="text-xl font-black text-cyan-100">{popupNotifications[0].payload.title || "Bread updated"}</p>
                <p className="mt-3 text-sm leading-6 text-[#d9f3ff]">{popupNotifications[0].payload.message || "One of your Pixel Breadlets was replaced."}</p>
                <button onClick={() => void dismissPlayerNotification()} className="mt-6 w-full rounded-2xl bg-cyan-300 px-4 py-3 font-black text-cyan-950 hover:bg-cyan-200">Got it</button>
              </div>
            </div>
          )}
          {claimReady && tab !== "wheel" && tab !== "capsules" && (
            <button type="button" onClick={() => setTab("wheel")} className="claim-ready-pill" title="Your hourly Bread Bucks claim is ready">
              <img src="/assets/Bread%20bucks.svg" alt="" aria-hidden="true" />Claim ready!
            </button>
          )}
          {inboxToast && (
            <button type="button" role="status" onClick={() => { setInboxToast(null); setInboxOpen(true); }} className="inbox-toast" title="Open your Inbox">
              <span className="inbox-toast-icon" aria-hidden="true">{inboxIcons[inboxToast.type] || "🔔"}</span>
              <span className="min-w-0 text-left"><b>{inboxToast.title}</b>{inboxToast.message && <span>{inboxToast.message}</span>}</span>
            </button>
          )}
          {inboxOpen && <InboxModal unreadCount={inboxUnreadCount} markRead={markNotificationsRead} close={() => setInboxOpen(false)} openMention={(messageId) => { setInboxOpen(false); setChatJump(messageId); setTab("chat"); }} />}
          {tab === "profile" && <ProfileTab player={player} setTab={setTab} showBadge={setBadgeInfo} savePlayer={save} addFriend={addFriend} isGuest={isGuest} onlineProfileIds={onlineProfileIds} presenceReady={presenceReady} viewedProfile={viewedProfile} openPlayerProfile={openPlayerProfile} closeViewedProfile={() => setViewedProfile(null)} inboxUnreadCount={inboxUnreadCount} openInbox={() => setInboxOpen(true)} refreshStats={() => refreshPlayerFromServer({ full: true })} />}
          {tab === "wheel" && <WheelTab player={player} spin={spinWheel} isGuest={isGuest} />}
          {tab === "capsules" && (
            <CapsulesTab
              openCapsule={(capsule) => { lastShopCapsuleRef.current = capsule; if (autoOpen) void startAutoOpen(capsule); else setCapsuleToConfirm(capsule); }}
              showOdds={setOddsCapsule}
              quickOpen={quickOpen}
              setQuickOpen={setQuickOpenSaved}
              autoOpen={autoOpen}
              setAutoOpen={setAutoOpen}
              showStockOdds={() => setStockOddsOpen(true)}
              isGuest={isGuest}
              claimTed={claimTedSecret}
              inventory={player.inventory}
            />
          )}
          {tab === "inventory" && (
            <InventoryTab player={player} equip={equip} sell={sell} massSell={massSell} toggleLock={toggleLock} toggleWish={toggleWish} />
          )}
          {tab === "market" && (
            <Bazaar
              player={player}
              createListing={createListing}
              cancelListing={cancelListing}
              openListing={setSelectedListing}
              buyListing={buyListing}
              isGuest={isGuest}
              toggleWish={toggleWish}
              setPlayerListings={(listings) => setPlayer((prev) => (prev ? { ...prev, listings } : null))}
            />
          )}
          {tab === "leaderboard" && <LeaderboardTab player={player} showBadge={setBadgeInfo} openPlayerProfile={openPlayerProfile} />}
          {tab === "explore" && player.exploreBeta && !isGuest && player.id && <BreadletExplore player={{ ...player, id: player.id }} artFor={artFor} />}
          {tab === "chat" && <ChatTab jumpTo={chatJump} clearJump={() => setChatJump("")} refreshPlayer={refreshPlayerFromServer} emojis={customEmojis} canManageEmojis={canManageEmojis} reloadEmojis={reloadEmojis} player={player} showBadge={setBadgeInfo} giftNotice={giftChatNotice} clearGiftNotice={() => setGiftChatNotice("")} isGuest={isGuest} onlinePlayers={onlinePlayers} openPlayerProfile={openPlayerProfile} />}
          {tab === "clan" && <ClanTab player={player} setClan={setClan} savePlayer={save} isGuest={isGuest} />}
          {tab === "crafting" && (
            <CraftingTab player={player} salvage={(name) => (player.lockedBlooks || []).includes(name) ? setNotice(`${name} is locked. Unlock it in My Breadlets to recycle it.`) : setPendingDismantle(name)} massDismantle={massDismantle} craft={craft} isGuest={isGuest} />
          )}
          {tab === "promo" && (
            <PromoTab
              code={promoCode}
              setCode={setPromoCode}
              redeem={redeemPromo}
            />
          )}
          {tab === "settings" && <SettingsTab username={player.username} isGuest={isGuest} onLogout={leaveSession} onRenamed={() => void refreshPlayerFromServer()} />}
          {tab === "resources" && <ResourcesTab open={(resource) => setTab(resource)} />}
          {tab === "bank" && <TokenBankTab isGuest={isGuest} />}
          {tab === "referrals" && <ReferralsTab isGuest={isGuest} />}
          {tab === "admin" && adminUnlocked && (
            <AdminTab
              player={player}
              onlineNow={onlinePlayers.length}
              grantReward={grantReward}
              moderateAccount={moderateAccount}
              announcement={announcement}
              setAnnouncement={setAnnouncement}
              publishAnnouncement={() => setNotice(announcement.trim() ? `Announcement published: ${announcement.trim()}` : "Write an announcement first.")}
              maintenanceModeActive={maintenanceModeActive}
              toggleMaintenance={toggleMaintenance}
              grantGift={(gift) => {
                save({
                  ...player,
                  tokens: player.tokens + gift.tokens,
                  inventory: [...player.inventory, ...gift.blooks],
                  badges: Array.from(new Set([...player.badges, ...gift.badges])),
                  materials: Object.fromEntries(materialNames.map((material) => [material, (player.materials[material] || 0) + (gift.materials[material] || 0)])),
                }, { inventory: true });
                const giftText = `${gift.title || "Admin gift"}: ${gift.message || "Gift received"}`;
                setGiftChatNotice(giftText);
                setNotice(`${giftText} · gift sent.`);
              }}
            />
          )}
        </section>
      </div>
      {tourOpen && <GameTour onSelect={setTab} onClose={() => { setTourOpen(false); setViewedProfile(null); setTab("profile"); }} />}
      {guestWelcomeOpen && (
        <div className="modal-layer fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 px-5 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-emerald-300/40 bg-[#10251f] p-6 text-white shadow-2xl">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-300">Guest test session</p>
            <h2 className="mt-2 text-2xl font-black">Everything is open to try</h2>
            <ul className="mt-4 space-y-2 text-sm leading-6 text-emerald-50/80">
              <li>Crates and every bag, including retired bags, are free to open.</li>
              <li>Crafting is free, and guests start with an empty collection.</li>
              <li>Chat, clans, and Bazaar are hidden during guest testing.</li>
              <li>Progress is temporary and disappears when you end this session unless you have unlocked browser saving.</li>
            </ul>
            <button onClick={() => setGuestWelcomeOpen(false)} className="mt-6 w-full rounded-xl bg-emerald-300 px-4 py-3 font-black text-emerald-950 hover:bg-emerald-200">Start testing</button>
          </div>
        </div>
      )}
      {reveal && <RevealModal reveal={reveal} quick={quickOpen} autoCount={autoCount} onClick={() => (revealClickRef.current ? revealClickRef.current() : setReveal(null))} />}
      {capsuleToConfirm && <ConfirmOpenModal
        title={capsuleToConfirm.name}
        description={`Are you sure you want to open ${capsuleToConfirm.name}?`}
        confirmLabel={isGuest ? "Open for free" : `Open for ${capsuleToConfirm.price} Bread Bucks`}
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
      {stockOddsOpen && <StockOddsModal close={() => setStockOddsOpen(false)} />}
      {pendingDismantle && (
        <DismantleConfirmModal
          name={pendingDismantle}
          bundle={dismantleBundleFor(pendingDismantle, rarityFor(pendingDismantle))}
          confirm={async () => {
            const dismantled = await salvage(pendingDismantle);
            if (dismantled) setPendingDismantle(null);
            return dismantled;
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
      if (document.hidden) return;
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

// Startup: blank for a moment (normal loads finish before anything shows), then a loading card.
// It never says "maintenance": a slow load isn't an update. That card only comes from the
// update-recovery script in layout.tsx, when a script file the page needs has been deleted.
function BootScreen() {
  const [stage, setStage] = useState<"blank" | "loading" | "slow">("blank");
  useEffect(() => {
    const loading = window.setTimeout(() => setStage("loading"), 3000);
    const slow = window.setTimeout(() => setStage("slow"), 20000);
    return () => { window.clearTimeout(loading); window.clearTimeout(slow); };
  }, []);
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#E77D22] px-5">
      {stage !== "blank" && (
        <div role="status" className="w-full max-w-sm rounded-[22px] border-4 border-[#13120F] bg-[#27251F] p-7 text-center text-white shadow-[0_8px_0_#13120F]">
          <img src="/assets/breadlet-logo.svg" alt="" className="boot-logo mx-auto h-16 w-16 object-contain" />
          <h1 className="mt-3 text-2xl font-black">Loading Breadlet...</h1>
          <p className="mt-1 text-sm opacity-85">{stage === "slow" ? "This is taking longer than usual. Your connection or our server might be slow." : "Getting your Breadlets ready."}</p>
          {stage === "slow" && <button type="button" onClick={() => window.location.reload()} className="mt-5 w-full rounded-[14px] bg-[#ED7117] px-4 py-3 font-black">Reload</button>}
        </div>
      )}
    </div>
  );
}

// Shown under a "banned" login error: the player explains themselves and an admin accepts or denies.
// Not a <form>: it sits inside the login form.
function BanAppealForm({ username, password }: { username: string; password: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const response = await fetch("/api/appeals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: username.trim(), password, message }) }).catch(() => null);
    const result = await response?.json().catch(() => ({}));
    setBusy(false);
    setStatus(response?.ok ? { ok: true, text: "Appeal sent! An admin will read it and accept or deny it. Try logging in again later." } : { ok: false, text: result?.error || "Could not send your appeal." });
  };
  if (status?.ok) return <p className="mt-4 rounded-xl bg-emerald-400/15 p-3 text-sm font-bold text-emerald-100">{status.text}</p>;
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="mt-4 w-full rounded-xl border border-[#73c8ff] px-4 py-3 font-black text-[#bde8ff]">Appeal ban</button>;
  return (
    <div className="mt-4 text-left">
      <label htmlFor="ban-appeal" className="text-xs font-bold uppercase tracking-widest text-[#eac477]">Why should your ban be lifted?</label>
      <textarea id="ban-appeal" value={message} onChange={(event) => setMessage(event.target.value.slice(0, 1000))} rows={4} placeholder="Explain what happened. Admins will read this." className="mt-2 w-full resize-y rounded-xl bg-[#0c3b70] px-3 py-2 text-sm text-white outline-none" />
      <p className="text-right text-xs text-white/50">{message.length}/1000</p>
      {status && <p role="alert" className="mt-1 text-sm font-bold text-rose-200">{status.text}</p>}
      <button type="button" disabled={busy || message.trim().length < 10} onClick={() => void submit()} className="mt-2 w-full rounded-xl bg-[#e9bd67] px-4 py-3 font-black text-[#29170c] disabled:opacity-50">{busy ? "Sending..." : "Send appeal"}</button>
    </div>
  );
}

// Background for every page but Ted's Shop (and the login screen): a tile of Breadlet silhouettes
// (public/assets/background-pattern.svg) that slowly drifts across and loops.
function BreadDrift({ className }: { className: string }) {
  return <div className={`bread-drift ${className}`} aria-hidden="true" />;
}

function LoginScreen({
  username,
  email,
  password,
  setUsername,
  setEmail,
  referralCode,
  setReferralCode,
  setPassword,
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
  setUsername: (value: string) => void;
  setEmail: (value: string) => void;
  referralCode: string;
  setReferralCode: (value: string) => void;
  setPassword: (value: string) => void;
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
    <main className="auth-screen relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0c3b70] px-5 text-white">
      <BreadDrift className="auth-drift" />
      <div className="auth-stack">
      <form
        onSubmit={login}
        className="auth-card w-full max-w-md"
      >
        <img src="/assets/breadlet-logo-2.svg" alt="Breadlet" className="auth-logo" />
        <p className="auth-tagline">Open bags, collect Breadlets, trade with friends.</p>
        {!forgotPassword && <div className="auth-tabs" role="tablist" aria-label="Log in or sign up">
          <button type="button" role="tab" aria-selected={authMode === "login"} onClick={() => setAuthMode("login")}>Log in</button>
          <button type="button" role="tab" aria-selected={authMode === "signup"} onClick={() => setAuthMode("signup")}>Sign up</button>
        </div>}
        <h1 className="text-center text-3xl font-black">
          {forgotPassword ? "Reset your password" : authMode === "login" ? "Log in" : "Start your collection"}
        </h1>
        <p className="mt-3 text-center text-sm leading-6 text-[#bde8ff]">
          {forgotPassword ? "Enter your username and we will email a reset link." : authMode === "login" ? "Enter your collection." : "Create your account and enter the game."}
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
        {!forgotPassword && authMode === "signup" && <label className="mt-5 block text-xs font-bold uppercase tracking-widest text-[#eac477]" htmlFor="referral">Referral code <span className="normal-case tracking-normal text-white/50">(optional)</span></label>}
        {!forgotPassword && authMode === "signup" && <input id="referral" value={referralCode} maxLength={16} onChange={(event) => setReferralCode(event.target.value.toUpperCase())} placeholder="Got a friend's code?" className="mt-2 w-full rounded-xl bg-[#0c3b70] px-4 py-3 text-white outline-none focus:border-[#73c8ff]" />}
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
        {notice && (
          <div className="modal-layer fixed inset-0 z-[9999] flex min-h-screen items-center justify-center bg-black/55 px-5 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl border border-[#73c8ff] bg-[#18558f] p-6 text-center shadow-2xl">
              <p className="text-lg font-black text-[#bde8ff]">Breadlet update</p>
              <p className="mt-3 text-sm text-[#d9f3ff]">{notice}</p>
              {/\bbanned\b/i.test(notice) && <BanAppealForm username={username} password={password} />}
              <button type="button" onClick={closeNotice} className="mt-5 w-full rounded-xl bg-[#39a8f5] px-4 py-3 font-black text-[#031426]">Close</button>
            </div>
          </div>
        )}
        <button type="submit" className="auth-primary mt-6 w-full rounded-xl px-4 py-3 font-black">
          {forgotPassword ? "Email reset link" : authMode === "login" ? "Log in" : "Create account"}
        </button>
        {authFeedback && <p role="status" className="mt-3 text-center text-xs leading-5 text-emerald-200">{authFeedback}</p>}
        {authMode === "login" && !forgotPassword && <button type="button" onClick={() => { resetClickCountRef.current = 0; setAuthFeedback(""); setForgotPassword(true); }} className="mt-3 w-full text-sm font-bold text-[#bde8ff]">Forgot password?</button>}
        {forgotPassword && <button type="button" onClick={() => { resetClickCountRef.current = 0; setAuthFeedback(""); setForgotPassword(false); }} className="mt-3 w-full text-sm font-bold text-[#bde8ff]">Back to log in</button>}
        {!forgotPassword && authMode === "login" && <button type="button" onClick={startGuest} className="auth-guest mt-4 w-full rounded-xl px-4 py-3 font-black">Play as guest · free</button>}
        {!forgotPassword && <button type="button" onClick={() => setAuthMode(authMode === "login" ? "signup" : "login")} className="mt-3 w-full text-sm font-bold text-[#bde8ff]">
          {authMode === "login" ? "Need an account? Sign up" : "Already have an account? Log in"}
        </button>}
      </form>
      </div>
    </main>
  );
}

// Inbox pop-up (from the Inbox button on your profile, or a toast): @mentions, Bazaar sales,
// completed trades and gifts, newest first.
function InboxModal({ unreadCount, markRead, close, openMention }: { unreadCount: number; markRead: (body: { id: string } | { all: true }) => Promise<void>; close: () => void; openMention: (messageId: string) => void }) {
  const [items, setItems] = useState<PlayerNotification[] | null>(null);
  const load = useCallback(async () => {
    const response = await fetch("/api/notifications?inbox=1", { cache: "no-store" }).catch(() => null);
    const rows = await response?.json().catch(() => null);
    if (Array.isArray(rows)) setItems(rows);
  }, []);
  // Reload whenever a new notification arrives (the unread count changes).
  useEffect(() => { void load(); }, [load, unreadCount]);
  const readAll = async () => {
    await markRead({ all: true });
    setItems((current) => current?.map((item) => ({ ...item, is_read: true })) || current);
  };
  const readOne = async (item: PlayerNotification) => {
    if (item.type === "mention" && item.payload.messageId) openMention(item.payload.messageId);
    if (item.is_read) return;
    await markRead({ id: item.id });
    setItems((current) => current?.map((row) => (row.id === item.id ? { ...row, is_read: true } : row)) || current);
  };
  const unread = items?.filter((item) => !item.is_read).length || 0;
  return (
    <div className="modal-layer fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="inbox-modal" role="dialog" aria-modal="true" aria-labelledby="inbox-heading">
      <div className="inbox-modal-header"><h2 id="inbox-heading">📬 Inbox{unread ? ` (${unread} new)` : ""}</h2>{unread > 0 && <button type="button" onClick={() => void readAll()} className="inbox-read-all">Mark all read</button>}<button type="button" onClick={close} aria-label="Close inbox" className="bazaar-offers-close">×</button></div>
      <div className="inbox-list">
        {items === null && <span className="profile-empty">Loading your inbox...</span>}
        {items?.length === 0 && <span className="profile-empty">Nothing yet. @mentions, Bazaar sales and finished trades show up here.</span>}
        {items?.map((item) => (
          <button key={item.id} type="button" onClick={() => void readOne(item)} className={`inbox-item${item.is_read ? "" : " is-unread"}`}>
            <span className="inbox-item-icon" aria-hidden="true">{inboxIcons[item.type] || "🔔"}</span>
            <span className="min-w-0 flex-1 text-left"><b>{item.payload.title || "Notification"}</b>{item.payload.message && <span className="inbox-item-message">{item.payload.message}</span>}</span>
            {item.created_at && <time className="inbox-item-time" dateTime={item.created_at}>{listedAgo(item.created_at).replace(/^Listed /, "")}</time>}
          </button>
        ))}
      </div>
    </section>
    </div>
  );
}

function ProfileTab({
  player,
  setTab,
  showBadge,
  savePlayer,
  addFriend,
  isGuest,
  onlineProfileIds,
  presenceReady,
  viewedProfile,
  openPlayerProfile,
  closeViewedProfile,
  inboxUnreadCount,
  openInbox,
  refreshStats,
}: {
  player: Player;
  setTab: (tab: Tab) => void;
  showBadge: (badge: string) => void;
  savePlayer: (player: Player) => void;
  addFriend: (username: string) => void;
  isGuest: boolean;
  onlineProfileIds: string[];
  presenceReady: boolean;
  viewedProfile: PublicProfile | null;
  openPlayerProfile: (username: string) => void | Promise<void>;
  closeViewedProfile: () => void;
  inboxUnreadCount: number;
  openInbox: () => void;
  refreshStats: () => void | Promise<void>;
}) {
  // Opening your profile reloads the counts it shows (bags opened, messages, trades).
  useEffect(() => {
    if (!isGuest) void refreshStats();
    // Once per visit to the tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [lookup, setLookup] = useState("");
  const [matches, setMatches] = useState<PublicProfile[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [tradesCompletedOnly, setTradesCompletedOnly] = useState(false);
  const [tradeMessage, setTradeMessage] = useState("");
  const [tradeAlert, setTradeAlert] = useState("");
  const [tradeErrorPopup, setTradeErrorPopup] = useState("");
  const [chatTrade, setChatTrade] = useState<any | null>(null);
  const [tradeMessages, setTradeMessages] = useState<any[]>([]);
  const [tradeChatInput, setTradeChatInput] = useState("");
  const [profileLookupOpen, setProfileLookupOpen] = useState(false);
  const [friendsData, setFriendsData] = useState<{ friends: { id: string; username: string }[]; incoming: { id: string; username: string }[]; outgoing: { id: string; username: string }[]; relation: string }>({ friends: [], incoming: [], outgoing: [], relation: "none" });
  const friendsProfileId = viewedProfile && viewedProfile.id !== player.id ? viewedProfile.id : player.id;
  const loadFriends = useCallback(async () => {
    if (isGuest) return;
    const response = await fetch(`/api/friends?profileId=${friendsProfileId}`, { cache: "no-store" });
    if (response.ok) setFriendsData(await response.json());
  }, [isGuest, friendsProfileId]);
  useEffect(() => { setFriendsData({ friends: [], incoming: [], outgoing: [], relation: "none" }); void loadFriends(); }, [loadFriends]);
  const friendAction = async (method: string, body: Record<string, string>) => {
    await fetch("/api/friends", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    await loadFriends();
  };
  const viewingOther = Boolean(viewedProfile && viewedProfile.id !== player.id);
  const profileName = viewingOther ? viewedProfile!.username : player.username;
  const profileTokens = viewingOther ? viewedProfile!.tokens : player.tokens;
  const profileEquipped = viewingOther ? viewedProfile!.equippedBlook : player.equipped;
  const profileInventoryCount = viewingOther ? viewedProfile!.inventoryCount : player.inventory.length;
  const profileBadges = viewingOther ? viewedProfile!.badges : player.badges;
  const profileCapsulesOpened = viewingOther ? viewedProfile!.capsulesOpened : player.capsulesOpened || 0;
  const profileMessagesSent = viewingOther ? viewedProfile!.messagesSent : player.messagesSent || 0;
  const profileCreatedAt = viewingOther ? viewedProfile!.createdAt : player.createdAt;
  const foundUser = lookup.trim() && lookup.trim().toLowerCase() !== player.username.toLowerCase() ? lookup.trim() : "";
  const realtimeClient = useMemo(() => isGuest ? null : createSupabaseClient(), [isGuest]);

  const loadTrades = useCallback(async () => {
    if (isGuest) return;
    const response = await fetchTradeApi({ cache: "no-store" });
    if (response.ok) setTrades(await response.json());
  }, [isGuest]);

  useEffect(() => {
    if (isGuest) return;
    void loadTrades();
    const fallback = window.setInterval(() => { if (!document.hidden) void loadTrades(); }, 90000);
    if (!realtimeClient || !player.id) return () => window.clearInterval(fallback);
    const channel = realtimeClient.channel(`profile-trades-${player.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "trades", filter: `receiver_profile_id=eq.${player.id}` }, (payload) => {
        if (payload.eventType === "INSERT") setTradeAlert("New trade request received.");
        void loadTrades();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "trades", filter: `sender_profile_id=eq.${player.id}` }, () => void loadTrades())
      .subscribe();
    return () => {
      window.clearInterval(fallback);
      void realtimeClient.removeChannel(channel);
    };
  }, [isGuest, loadTrades, player.id, realtimeClient]);

  useEffect(() => {
    if (!chatTrade || !realtimeClient) return;
    const loadTradeMessages = async () => {
      const response = await fetch(`/api/trades/messages?tradeId=${encodeURIComponent(chatTrade.id)}`, { cache: "no-store" });
      if (response.ok) setTradeMessages(await response.json());
    };
    void loadTradeMessages();
    const channel = realtimeClient.channel(`trade-chat-${chatTrade.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "trade_messages", filter: `trade_id=eq.${chatTrade.id}` }, () => void loadTradeMessages())
      .subscribe();
    return () => { void realtimeClient.removeChannel(channel); };
  }, [chatTrade, realtimeClient]);

  const sendTradeMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = tradeChatInput.trim();
    if (!chatTrade || !message) return;
    const response = await fetch("/api/trades/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tradeId: chatTrade.id, message }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setTradeMessage(body.error || "Could not send trade message.");
      return;
    }
    setTradeChatInput("");
    setTradeMessages((current) => current.some((item) => item.id === body.id) ? current : [...current, body]);
  };

  const searchPlayers = async () => {
    if (lookup.trim().length < 2) return;
    const response = await fetch(`/api/players/search?q=${encodeURIComponent(lookup.trim())}`);
    if (response.ok) setMatches(await response.json());
  };

  const requestTrade = async (targetId: string, targetName: string) => {
    if (!onlineProfileIds.includes(targetId)) {
      setTradeErrorPopup(presenceReady ? `${targetName} is offline. Both players must be online to trade.` : "Checking player availability. Please try again in a moment.");
      return;
    }
    const response = await fetchTradeApi({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", receiverUsername: targetName, offer: { tokens: 0, blooks: [] } }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setTradeErrorPopup(result.error || "Could not send the trade request.");
      return;
    }
    setTradeMessage(`Trade request sent to ${targetName}.`);
    window.dispatchEvent(new Event("breadlet:trades-refresh"));
    await loadTrades();
  };

  const respondToTrade = async (tradeId: string, action: string) => {
    const response = await fetchTradeApi({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tradeId, action }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) setTradeMessage(result.error || "Trade action failed.");
    if (response.ok && result.status === "completed") {
      const refreshed = await fetch("/api/player", { cache: "no-store" });
      if (refreshed.ok) savePlayer(playerFromServer(await refreshed.json()));
    }
    await loadTrades();
  };

  const offerSummary = (offer: any) => {
    const blooks = Array.isArray(offer?.blooks) ? offer.blooks : [];
    const tokens = Number(offer?.tokens) || 0;
    return [tokens ? `${tokens.toLocaleString()} Bread Bucks` : "", ...blooks.map((item: any) => `${item.name} ×${item.quantity}`)].filter(Boolean).join(" · ") || "No items or Bread Bucks offered";
  };
  const tokenBadges = tokenBadgesFor(profileTokens);
  const displayedBadges = Array.from(new Set([...profileBadges, ...tokenBadges]));
  const openLookup = () => { setMatches([]); setLookup(""); setProfileLookupOpen(true); };
  return (
    <div className="profile-dashboard">
      {tradeAlert && <button onClick={() => { setTradeAlert(""); document.getElementById("profile-trades")?.scrollIntoView({ behavior: "smooth" }); }} className="profile-trade-toast" role="status">{tradeAlert}<span>View trade</span></button>}
      <div className="profile-top-grid">
        <section className="profile-player-panel">
          <div className="profile-avatar-frame profile-avatar-float"><span className="profile-float-inner">{profileEquipped ? <BlookImg name={profileEquipped} className="h-full w-full" /> : <img src="/assets/breadlet-logo.svg" alt="" className="h-full w-full object-contain" />}</span></div>
          <div className="profile-player-copy"><span className="profile-subtitle">Player profile</span><h1>{profileName}{(viewingOther ? viewedProfile?.clanTag : player.clanTag) && <span> [{viewingOther ? viewedProfile?.clanTag : player.clanTag}]</span>}</h1><p>{profileEquipped ? `${profileEquipped} · ${rarityFor(profileEquipped)}` : "No Bread equipped"}</p>
            {viewingOther && <button onClick={closeViewedProfile} className="mt-2 text-xs font-bold text-sky-200 hover:text-white">Back to my profile</button>}
            <div className="profile-quick-actions">{viewingOther ? <button onClick={() => void requestTrade(viewedProfile!.id, viewedProfile!.username)}><ShoppingBag size={17} />Trade</button> : <button onClick={() => setTab("wheel")}><Package size={17} />Claim Bread Bucks</button>}<button onClick={openLookup}><Search size={17} />Find Player</button>{!viewingOther && !isGuest && <button onClick={openInbox} className="profile-inbox-button">📬 Inbox{inboxUnreadCount > 0 && <span className="nav-unread-badge">{inboxUnreadCount > 9 ? "9+" : inboxUnreadCount}</span>}</button>}</div>
          </div>
        </section>
        <section className="profile-badges-panel"><div className="profile-section-label">Badges</div><div className="profile-badge-row">{displayedBadges.length ? displayedBadges.map((badge) => <button key={badge} title={badge} onClick={() => showBadge(badge)}><img src={badgeIconFor(badge)} alt={badge} /></button>) : <span className="profile-empty">No badges yet</span>}</div><div className="profile-token-rank">{tokenBadges.at(-1) || "Token milestones: 10K · 100K · 1M"}</div></section>
      </div>
      <section className="profile-stats-panel"><div className="profile-section-label">Stats</div><div className="profile-stats-grid">
        <ProfileMetric label="Tokens" value={profileTokens.toLocaleString()} icon="/assets/Bread%20bucks.svg" />
        <ProfileMetric label="Breadlets Owned" value={profileInventoryCount.toLocaleString()} icon={<Backpack size={38} strokeWidth={2.4} />} />
        <ProfileMetric label="Bags Opened" value={String(profileCapsulesOpened)} icon="/assets/space bag updated again (1).svg" />
        <ProfileMetric label="Messages Sent" value={String(profileMessagesSent)} icon={<MessageCircle size={38} strokeWidth={2.4} />} />
        <ProfileMetric label="Account Age" value={accountAgeLabel(profileCreatedAt)} icon={<CalendarDays size={38} strokeWidth={2.4} />} />
      </div></section>
      <div className="profile-lower-grid"><section className="profile-list-panel"><div className="profile-list-heading"><h2>Friends{friendsData.friends.length ? ` (${friendsData.friends.length})` : ""}</h2>{!viewingOther ? <button onClick={openLookup}>Find Player</button> : !isGuest && (friendsData.relation === "none" ? <button onClick={() => void friendAction("POST", { friendProfileId: viewedProfile!.id })}>Add Friend</button> : friendsData.relation === "pending-in" ? <button onClick={() => void friendAction("POST", { friendProfileId: viewedProfile!.id })}>Accept</button> : friendsData.relation === "pending-out" ? <button onClick={() => void friendAction("DELETE", { friendProfileId: viewedProfile!.id })}>Request Sent (Cancel)</button> : friendsData.relation === "friends" ? <button onClick={() => void friendAction("DELETE", { friendProfileId: viewedProfile!.id })}>Unfriend</button> : null)}</div><div className="profile-list-body">
        {!viewingOther && friendsData.incoming.map((request) => <div key={request.id} className="profile-friend-row"><img src="/assets/breadlet-logo.svg" alt="" /><span className="min-w-0 flex-1 truncate">{request.username} wants to be friends</span><button onClick={() => void friendAction("PATCH", { requesterId: request.id, decision: "accept" })}>Accept</button><button onClick={() => void friendAction("PATCH", { requesterId: request.id, decision: "decline" })}>Decline</button></div>)}
        {friendsData.friends.length ? friendsData.friends.map((friend) => <div key={friend.id} className="profile-friend-row"><img src="/assets/breadlet-logo.svg" alt="" /><button onClick={() => void openPlayerProfile(friend.username)} className="min-w-0 flex-1 truncate text-left font-bold">{friend.username}</button>{!viewingOther && <button onClick={() => void friendAction("DELETE", { friendProfileId: friend.id })}>Remove</button>}</div>) : !friendsData.incoming.length && <p className="profile-empty">{isGuest ? "Sign in to add friends." : "No friends yet."}</p>}
        {!viewingOther && friendsData.outgoing.map((request) => <div key={request.id} className="profile-friend-row"><img src="/assets/breadlet-logo.svg" alt="" /><span className="min-w-0 flex-1 truncate">{request.username} (request sent)</span><button onClick={() => void friendAction("DELETE", { friendProfileId: request.id })}>Cancel</button></div>)}
      </div></section></div>
      {!viewingOther && <div className="profile-lower-grid">
        {!isGuest && <section className="profile-list-panel" id="profile-trades"><div className="profile-list-heading"><h2>Trades</h2><div className="flex gap-2"><button aria-pressed={tradesCompletedOnly} onClick={() => setTradesCompletedOnly(!tradesCompletedOnly)}>{tradesCompletedOnly ? "Showing completed" : "Completed only"}</button><button onClick={() => void loadTrades()}>Refresh</button></div></div>{tradeMessage && <p role="status" className="profile-alert-inline">{tradeMessage}</p>}<div className="profile-list-body profile-trade-list">{trades.filter((trade) => !tradesCompletedOnly || trade.status === "completed").map((trade) => {
          const sentByMe = trade.sender_profile_id === player.id;
          const otherName = sentByMe ? trade.receiver_username : trade.sender_username;
          const myOffer = sentByMe ? trade.sender_offer_json : trade.receiver_offer_json;
          const theirOffer = sentByMe ? trade.receiver_offer_json : trade.sender_offer_json;
          const confirmed = sentByMe ? trade.sender_confirmed : trade.receiver_confirmed;
          return <article key={trade.id} className="profile-trade-row"><div className="profile-trade-head"><strong>{otherName}</strong>{trade.updated_at && <small className="profile-trade-date">{new Date(trade.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</small>}<span className={`profile-trade-status status-${trade.status}`}>{trade.status}</span></div><p>You: {offerSummary(myOffer)}</p><p>Them: {offerSummary(theirOffer)}</p><div className="profile-trade-actions">{trade.status === "pending" && <span className="profile-empty">Open in the live trade window</span>}{trade.status === "completed" && <button className="profile-action-primary" onClick={() => { setChatTrade(trade); setTradeMessages([]); }}>Open live chat</button>}</div></article>;
        })}{!trades.filter((trade) => !tradesCompletedOnly || trade.status === "completed").length && <p className="profile-empty">{tradesCompletedOnly ? "No completed trades yet." : "No trades yet. Find a player to send a trade request."}</p>}</div></section>}
      </div>}
      {profileLookupOpen && <div className="modal-layer fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm"><section role="dialog" aria-modal="true" className="profile-popup"><div className="profile-list-heading"><h2>Find a Player</h2><button aria-label="Close player lookup" onClick={() => setProfileLookupOpen(false)}>×</button></div><div className="profile-search-row"><input value={lookup} onChange={(event) => setLookup(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void searchPlayers()} placeholder="Search username" /><button onClick={() => void searchPlayers()}>Search</button></div><div className="mt-3 max-h-72 space-y-2 overflow-y-auto">{matches.map((match) => <div key={match.id} className="profile-friend-row"><button onClick={() => { setProfileLookupOpen(false); void openPlayerProfile(match.username); }} className="min-w-0 flex-1 truncate text-left font-bold">{match.username}</button><button onClick={() => addFriend(match.username)}>Add</button><button disabled={isGuest} onClick={() => { setProfileLookupOpen(false); void requestTrade(match.id, match.username); }}>Trade</button></div>)}{!matches.length && <p className="profile-empty">Search for a username to add, trade, or view.</p>}</div></section></div>}
      {chatTrade && <TradeChatModal trade={chatTrade} playerId={player.id || ""} username={player.username} messages={tradeMessages} input={tradeChatInput} setInput={setTradeChatInput} close={() => setChatTrade(null)} send={sendTradeMessage} />}
      {tradeErrorPopup && <div className="modal-layer fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 px-4"><section role="alertdialog" aria-modal="true" className="profile-popup w-full max-w-sm"><h2 className="text-xl font-black">Trade unavailable</h2><p className="mt-3 text-sm">{tradeErrorPopup}</p><button autoFocus onClick={() => setTradeErrorPopup("")} className="profile-action-primary mt-5 w-full rounded-lg px-4 py-3 font-black">OK</button></section></div>}
    </div>
  );
}

function ProfileMetric({ label, value, icon }: { label: string; value: string; icon: string | React.ReactNode }) {
  return <div className="profile-metric">
    <span className="profile-metric-icon" aria-hidden="true">{typeof icon === "string" ? <img src={icon} alt="" /> : icon}</span>
    <div className="min-w-0 text-center"><p>{label}</p><strong>{value}</strong></div>
  </div>;
}

function TradeChatModal({
  trade,
  playerId,
  username,
  messages,
  input,
  setInput,
  close,
  send,
}: {
  trade: any;
  playerId: string;
  username: string;
  messages: any[];
  input: string;
  setInput: (value: string) => void;
  close: () => void;
  send: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const otherName = trade.sender_profile_id === playerId ? trade.receiver_username : trade.sender_username;
  const ownOffer = trade.sender_profile_id === playerId ? trade.sender_offer_json : trade.receiver_offer_json;
  const otherOffer = trade.sender_profile_id === playerId ? trade.receiver_offer_json : trade.sender_offer_json;
  const offerCard = (label: string, offer: any, usernameLabel: string) => <div className="rounded-2xl border border-[#9a3f08] bg-[#6f2e08] p-3"><p className="text-xs font-black uppercase tracking-widest text-orange-200">{label}</p><h3 className="mt-1 font-black text-orange-50">{usernameLabel}</h3><p className="mt-2 text-sm text-orange-100">Tokens: {Number(offer?.tokens || 0).toLocaleString()}</p><div className="mt-2 space-y-1">{(offer?.blooks || []).map((item: any) => <div key={item.name} className="flex items-center gap-2 rounded-lg bg-black/20 px-2 py-1 text-xs text-orange-50"><img src={artFor(item.name)} alt="" className="h-8 w-8 object-contain" /><span>{item.name} x{item.quantity}</span></div>)}</div></div>;
  return <div className="modal-layer fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-4 py-5 backdrop-blur-sm">
    <section role="dialog" aria-modal="true" aria-label={`Trade chat with ${otherName}`} className="profile-popup flex max-h-[92vh] flex-col">
      <div className="profile-list-heading"><div><p className="profile-section-label">Accepted trade</p><h2>Chat with {otherName}</h2></div><button onClick={close} aria-label="Close trade chat">×</button></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{offerCard("Your offer", ownOffer, username)}{offerCard("Their offer", otherOffer, otherName)}</div>
      <div className="trade-chat-messages mt-4 flex-1 space-y-2 overflow-y-auto">{messages.map((item) => <div key={item.id} className={`trade-chat-message ${item.profile_id === playerId ? "trade-chat-mine" : ""}`}><b>{item.username || (item.profile_id === playerId ? username : otherName)}</b><p>{item.message}</p><time>{new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div>)}{!messages.length && <p className="profile-empty">Trade accepted. Say hello!</p>}</div>
      <form onSubmit={send} className="profile-search-row mt-4"><input value={input} maxLength={1000} onChange={(event) => setInput(event.target.value)} placeholder="Message this player" /><button type="submit">Send</button></form>
    </section>
  </div>;
}

function rarityFor(name: string) {
  const baseName = name.replace(/^Shiny /, "");
  if (baseName === "Ted" || baseName === "Walter White") return "Unique";
  const craftedRarity = craftedRarityFor(baseName);
  if (craftRecipes.some((recipe) => recipe.name === baseName)) return craftedRarity;
  return (
    [...liveCapsules, ...legacyCapsules]
      .flatMap((capsule) => capsule.pool)
      .find((reward) => reward.name === baseName)?.rarity || "Common"
  );
}

function CapsulesTab({
  openCapsule,
  showOdds,
  quickOpen,
  setQuickOpen,
  autoOpen,
  setAutoOpen,
  showStockOdds,
  isGuest,
  claimTed,
  inventory,
}: {
  inventory: string[];
  openCapsule: (capsule: Capsule) => void;
  showOdds: (capsule: Capsule) => void;
  quickOpen: boolean;
  setQuickOpen: (value: boolean) => void;
  autoOpen: boolean;
  setAutoOpen: (value: boolean) => void;
  showStockOdds: () => void;
  isGuest: boolean;
  claimTed: () => Promise<{ triggered: boolean; claimed: boolean } | null>;
}) {
  const [now, setNow] = useState(() => new Date());
  const [selectedCapsule, setSelectedCapsule] = useState<Capsule | null>(null);
  const [tedVisible, setTedVisible] = useState(false);
  const [tedCongrats, setTedCongrats] = useState(false);
  const shopClickCount = useRef(0);
  const shopClickTimer = useRef<number | null>(null);
  const tedPopupTimer = useRef<number | null>(null);
  const tedClaimBusy = useRef(false);
  // Only re-render the shop when the stock actually rotates; the countdown ticks on its own.
  useEffect(() => {
    const timer = window.setTimeout(() => setNow(new Date()), Math.max(1000, nextMarketRefreshAt(now).getTime() - Date.now() + 250));
    return () => window.clearTimeout(timer);
  }, [now]);
  useEffect(() => {
    return () => {
      if (shopClickTimer.current) window.clearTimeout(shopClickTimer.current);
      if (tedPopupTimer.current) window.clearTimeout(tedPopupTimer.current);
    };
  }, []);
  const showTedSecret = (claimed: boolean) => {
    setTedVisible(true);
    if (claimed) setTedCongrats(true);
    if (tedPopupTimer.current) window.clearTimeout(tedPopupTimer.current);
    tedPopupTimer.current = window.setTimeout(() => {
      setTedVisible(false);
      tedPopupTimer.current = null;
    }, 5000);
  };
  const clickShopHeading = () => {
    if (!isGuest) {
      void claimTed().then((result) => {
        if (result?.triggered) showTedSecret(result.claimed);
      });
      return;
    }
    if (tedClaimBusy.current) return;
    shopClickCount.current += 1;
    if (shopClickTimer.current) window.clearTimeout(shopClickTimer.current);
    shopClickTimer.current = window.setTimeout(() => {
      shopClickCount.current = 0;
      shopClickTimer.current = null;
    }, 2500);
    if (shopClickCount.current < 3) return;
    shopClickCount.current = 0;
    if (shopClickTimer.current) window.clearTimeout(shopClickTimer.current);
    shopClickTimer.current = null;
    tedClaimBusy.current = true;
    void claimTed().then((result) => {
      if (result?.triggered) showTedSecret(result.claimed);
    }).finally(() => {
      tedClaimBusy.current = false;
    });
  };
  const stockOdds = new Map(marketPackStock.map(({ name, chance }) => [name, chance]));
  // Seasonal packs that haven't opened yet stand with the fresh stock, tagged with their opening day.
  const freshBags = liveCapsules.filter((capsule) => isMarketPackInStock(capsule.name, now) || isSeasonalPackLocked(capsule.name, now));
  const soldOutBags = liveCapsules.filter((capsule) => !isMarketPackInStock(capsule.name, now) && !isSeasonalPackLocked(capsule.name, now));
  // Collection progress for each bag: different Breadlets owned out of the bag's pool.
  const ownedNames = new Set(inventory);
  const progressFor = (capsule: Capsule) => ({ owned: capsule.pool.filter((reward) => ownedNames.has(reward.name)).length, total: capsule.pool.length });
  const cabinet = (label: string, bags: Capsule[], soldOut: boolean) => (
    <section className={`shop-cabinet ${soldOut ? "is-sold-out" : ""}`} aria-label={label}>
      <div className="shop-cabinet-sign"><span>{label}</span></div>
      <div className="shop-cabinet-shelves">
        {bags.map((capsule) => (
          <button key={capsule.name} type="button" onClick={() => setSelectedCapsule(capsule)} className={`shop-shelf-bag${isSeasonalPackLocked(capsule.name, now) ? " is-locked" : ""}`} data-name={capsule.name} aria-label={`View ${capsule.name}`}>
            <img src={capsule.art} alt="" className="shop-shelf-art" />
            {soldOut && <span className="shop-sold-stamp" aria-hidden="true">Sold out</span>}
            {isSeasonalPackLocked(capsule.name, now) && <span className="shop-soon-stamp">Opens {opensOnLabel(capsule.name, "short")}</span>}
            <span className="shop-price-tag"><img src="/assets/Bread%20bucks.svg" alt="" />{isGuest ? "Free" : capsule.price.toLocaleString()}</span>
            {(() => { const progress = progressFor(capsule); return <span className={`shop-collect-tag${progress.owned === progress.total ? " is-complete" : ""}`} title="Breadlets you've collected from this bag">{progress.owned}/{progress.total}</span>; })()}
          </button>
        ))}
        {!bags.length && <p className="shop-cabinet-empty">Ted is restocking. Check back soon!</p>}
      </div>
    </section>
  );

  return (
    <div className="goodybags-page shop-scene min-h-full">
      <div className="shop-awning" aria-hidden="true" />
      <div className="shop-header">
        <button type="button" onClick={clickShopHeading} className="teds-shop-heading shop-title bg-transparent p-0" title="Ted's Shop">
          Ted's Shop
        </button>
        <button type="button" aria-pressed={quickOpen} onClick={() => setQuickOpen(!quickOpen)} title="Faster opening animation" className="shop-switch"><span className="shop-switch-track"><Zap size={13} aria-hidden="true" /></span>Quick open</button>
        <button type="button" aria-pressed={autoOpen} onClick={() => setAutoOpen(!autoOpen)} title="Keeps opening the pack you pick until you run out of Bread Bucks or click the screen" className="shop-switch"><span className="shop-switch-track"><Repeat size={13} aria-hidden="true" /></span>Auto open</button>
        <div className="shop-header-right">
          <div className="shop-restock" title="Stock rolls again every hour on the UTC hour"><Clock size={18} aria-hidden="true" /><span>Restock in</span><MarketRefreshCountdown /></div>
          <button type="button" onClick={showStockOdds} className="shop-chip-button" title="Chance for each bag to be in stock" aria-label="Show stock chances"><Info size={18} /></button>
        </div>
      </div>
      <div className="shop-cabinets">
        {cabinet("Fresh stock", freshBags, false)}
        {soldOutBags.length > 0 && cabinet("Sold out", soldOutBags, true)}
      </div>
      <div className="shop-floor" aria-hidden="true" />
      {tedVisible && <div className="ted-secret-appearance" aria-hidden="true"><img src="/assets/ted-shopkeeper.svg" alt="" /></div>}
      {tedCongrats && (
        <div className="modal-layer fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 px-5 backdrop-blur-sm">
          <section className="w-full max-w-sm rounded-3xl border border-fuchsia-400/60 bg-[#3a2415] p-6 text-center text-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="ted-secret-heading">
            <img src="/assets/ted-shopkeeper.svg" alt="Ted" className="mx-auto h-36 w-36 object-contain" />
            <p className="mt-2 text-xs font-black uppercase tracking-widest text-fuchsia-300">Secret found</p>
            <h2 id="ted-secret-heading" className="mt-1 text-2xl font-black">Congrats!</h2>
            <p className="mt-2 text-sm text-white/80">You found Ted! Unique Ted has been added to your inventory.</p>
            <button type="button" onClick={() => setTedCongrats(false)} className="mt-5 w-full rounded-xl bg-fuchsia-300 px-4 py-3 font-black text-fuchsia-950">Awesome!</button>
          </section>
        </div>
      )}
      {selectedCapsule && (
        <PackDetailsModal
          capsule={selectedCapsule}
          inStock={isMarketPackInStock(selectedCapsule.name, now)}
          opensOn={isSeasonalPackLocked(selectedCapsule.name, now) ? opensOnLabel(selectedCapsule.name) : undefined}
          stockChance={stockOdds.get(selectedCapsule.name) ?? 0}
          collected={progressFor(selectedCapsule)}
          isGuest={isGuest}
          auto={autoOpen}
          close={() => setSelectedCapsule(null)}
          showStockOdds={showStockOdds}
          showRewardOdds={() => showOdds(selectedCapsule)}
          open={() => {
            const capsule = selectedCapsule;
            setSelectedCapsule(null);
            openCapsule(capsule);
          }}
        />
      )}
    </div>
  );
}

// "December 1" (or "Dec 1") for a seasonal pack's opening day.
const opensOnLabel = (name: string, month: "long" | "short" = "long") =>
  new Date(seasonalPackOpensAt[name]).toLocaleDateString("en-US", { month, day: "numeric", timeZone: "UTC" });

function MarketRefreshCountdown() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const timeToRefresh = Math.max(0, nextMarketRefreshAt(now).getTime() - now.getTime());
  const refreshLabel = `${String(Math.floor(timeToRefresh / 3600000)).padStart(2, "0")}:${String(Math.floor((timeToRefresh % 3600000) / 60000)).padStart(2, "0")}:${String(Math.floor((timeToRefresh % 60000) / 1000)).padStart(2, "0")}`;
  return <span className="font-mono text-lg tracking-widest">{refreshLabel}</span>;
}

function PackDetailsModal({
  capsule,
  inStock,
  opensOn,
  stockChance,
  isGuest,
  auto,
  close,
  showStockOdds,
  showRewardOdds,
  open,
  collected,
}: {
  collected: { owned: number; total: number };
  capsule: Capsule;
  inStock: boolean;
  // Set for a seasonal pack that hasn't opened yet, e.g. "December 1".
  opensOn?: string;
  stockChance: number;
  isGuest: boolean;
  auto: boolean;
  close: () => void;
  showStockOdds: () => void;
  showRewardOdds: () => void;
  open: () => void;
}) {
  return (
    <div className="modal-layer fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 px-5 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section className="bazaar-offers shop-pack-modal" role="dialog" aria-modal="true" aria-labelledby="pack-details-heading">
        <div className="bazaar-offers-header">
          <div className="bazaar-offers-art"><img src={capsule.art} alt="" className={`h-full w-full object-contain ${inStock ? "" : "grayscale brightness-75"}`} /></div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-widest opacity-70">Ted&apos;s Shop</p>
            <h2 id="pack-details-heading" className="truncate text-2xl font-black">{capsule.name}</h2>
            <span className={`shop-stock-pill is-static mt-1 ${inStock ? "is-in" : opensOn ? "is-soon" : "is-out"}`}>{inStock ? "In stock" : opensOn ? `Opens ${opensOn}` : "Sold out"}</span>
          </div>
          <button type="button" onClick={close} aria-label="Close Goodybag details" className="bazaar-offers-close">×</button>
        </div>
        <div className="shop-pack-facts">
          <p><span>Price</span><b className="bazaar-offer-price">{isGuest ? "Free" : <><img src="/assets/Bread%20bucks.svg" alt="" />{capsule.price.toLocaleString()}</>}</b></p>
          <p><span>Breadlets inside</span><b>{capsule.pool.length}</b></p>
          <p><span>You've collected</span><b>{collected.owned}/{collected.total}{collected.owned === collected.total ? " ✓" : ""}</b></p>
          {capsule.seasonal ? <p><span>Seasonal</span><b>{opensOn ? `Opens ${opensOn}` : "Always in stock"}</b></p> : <p>
            <span>Chance to be in stock</span>
            <span className="flex items-center gap-2">
              <b>{Number((stockChance * 100).toFixed(2))}%</b>
              <button type="button" onClick={showStockOdds} title="Show all stock chances" aria-label="Show all stock chances" className="shop-info-button">
                <Info size={14} />
              </button>
            </span>
          </p>}
        </div>
        <button type="button" onClick={showRewardOdds} className="open-toggle mt-4 w-full justify-center">View reward chances</button>
        <button type="button" disabled={!inStock} onClick={open} className="bazaar-buy-button mt-3">
          {opensOn ? `Opens ${opensOn}` : !inStock ? "Currently sold out" : auto ? (isGuest ? "Start auto open (free)" : `Start auto open · ${capsule.price} each`) : isGuest ? "Open for free" : `Open for ${capsule.price} Bread Bucks`}
        </button>
      </section>
    </div>
  );
}

function StockOddsModal({ close }: { close: () => void }) {
  return (
    <div className="modal-layer fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 px-5 backdrop-blur-sm">
      <section className="bazaar-offers" role="dialog" aria-modal="true" aria-labelledby="stock-odds-heading">
        <div className="bazaar-offers-header">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-widest opacity-70">Hourly stock</p>
            <h2 id="stock-odds-heading" className="text-2xl font-black">Chance to be in stock</h2>
          </div>
          <button type="button" onClick={close} aria-label="Close stock chances" className="bazaar-offers-close">×</button>
        </div>
        <div className="bazaar-offers-list">
          {marketPackStock.map(({ name, chance }) => (
            <div key={name} className="bazaar-offer-row justify-between text-sm font-bold">
              <span>{name}</span><b className="text-[#ffcb73]">{chance < 0.01 ? "0.5%" : `${chance * 100}%`}</b>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs font-bold opacity-70">Stock rolls again every hour on the UTC hour.</p>
      </section>
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
  return <AnimatedArtFrame src={`/assets/star ship frame ${frame}.svg`} name="Star Ship" className={className} />;
}

const lostAndFoundBoxFrames = [
  "/assets/Lost%20and%20found%20box%20frame%201.svg",
  "/assets/Lost%20and%20found%20box%202.svg",
  "/assets/Lost%20and%20found%20box%203.svg",
  "/assets/Lost%20and%20found%20box%204.svg",
  "/assets/Lost%20and%20found%20box%205.svg",
  "/assets/Lost%20and%20found%20box%206.svg",
];
const goldenToasterFrames = [
  "/assets/goldenToaster%20frame%201.svg",
  "/assets/goldenToaster2.svg",
  "/assets/goldenToaster3.svg",
  "/assets/goldenToaster4.svg",
];
const alienFrames = Array.from({ length: 13 }, (_, index) => `/assets/alien%202%20frame%20${index + 1}.svg`);
// Reindeer: the nose glow swells and fades. Gnome: waves its arms (played forward then back).
const reindeerFrames = [1, 2, 3, 4, 5].map((frame) => `/assets/winter/reindeer-${frame}.svg`);
const gnomeFrames = [1, 2, 3, 4, 5, 6, 5, 4, 3, 2].map((frame) => `/assets/winter/gnome-${frame}.svg`);
// Tanuki: the leaf and ear sway (frame 7 leads back into frame 1).
const tanukiFrames = [1, 2, 3, 4, 5, 6, 7].map((frame) => `/assets/fall/tanuki-${frame}.svg`);
const diamondSwordFrames = [
  "/assets/diamond%20sword%20frame%20one.svg",
  ...Array.from({ length: 7 }, (_, index) => `/assets/diamond%20sword${index + 2}.svg`),
];
function FrameSwitcher({ frames, name, className }: { frames: string[]; name: string; className: string }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setFrame((current) => (current + 1) % frames.length);
    }, 180);
    return () => window.clearInterval(timer);
  }, [frames]);
  return <AnimatedArtFrame src={frames[frame]} name={name} className={className} />;
}

const pixelSprinkleFrames = [1, 2, 3].map((frame) => `/assets/Lost and found + food pack/Pixel sprinkle bread frame ${frame}.png?v=2`);
function PixelSprinkleFrameSwitcher({ className }: { className: string }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setFrame((current) => (current + 1) % pixelSprinkleFrames.length), 220);
    return () => clearInterval(timer);
  }, []);
  return <AnimatedArtFrame src={pixelSprinkleFrames[frame]} name="Pixel Sprinkle Bread" className={className} />;
}

function RewardArt({ name, art, className }: { name: string; art: string; className: string }) {
  const cleanName = name.replace(/^Shiny /, "");
  if (cleanName === "Bitcoin") {
    return <span className={`bitcoin-art relative inline-flex items-center justify-center ${className}`}>
      <img src={art} alt={name} decoding="async" className="max-h-full max-w-full object-contain" />
      {[-1, -0.5, 0.5, 1].map((direction, index) => <img key={direction} src="/assets/bitcoin pop out.svg" alt="" aria-hidden="true" className="bitcoin-popout" style={{ "--coin-direction": direction, "--coin-delay": `${index * 0.35}s` } as React.CSSProperties} />)}
    </span>;
  }
  if (cleanName === "Star Ship") {
    return <StarShipFrameSwitcher className={className} />;
  }
  if (cleanName === "Lost and Found Box") {
    return <FrameSwitcher frames={lostAndFoundBoxFrames} name={name} className={className} />;
  }
  if (cleanName === "Golden Toaster") {
    return <FrameSwitcher frames={goldenToasterFrames} name={name} className={className} />;
  }
  if (cleanName === "Alien") {
    return <FrameSwitcher frames={alienFrames} name={name} className={className} />;
  }
  if (cleanName === "Reindeer") {
    return <FrameSwitcher frames={reindeerFrames} name={name} className={className} />;
  }
  if (cleanName === "Gnome") {
    return <FrameSwitcher frames={gnomeFrames} name={name} className={className} />;
  }
  if (cleanName === "Tanuki") {
    return <FrameSwitcher frames={tanukiFrames} name={name} className={className} />;
  }
  if (cleanName === "Diamond Sword") {
    return <FrameSwitcher frames={diamondSwordFrames} name={name} className={className} />;
  }
  if (cleanName === "Timeglass") {
    return <span className={`timeglass-sequence relative inline-flex h-full w-full items-center justify-center ${className}`}>{[1, 2, 3, 4, 5, 6].map((number) => `/assets/timeglass/frame-${number}.svg`).map((frame, index) => <img key={frame} src={frame} alt={name} className={`timeglass-frame timeglass-frame-${index} max-h-full max-w-full object-contain`} />)}</span>;
  }
  if (cleanName === "Pickle") {
    return <OozingPickle className={className} />;
  }
  if (cleanName === "Pixel Sprinkle Bread") {
    return <PixelSprinkleFrameSwitcher className={className} />;
  }
  return (
    <span className={`relative inline-flex items-center justify-center ${className}`}>
      <img src={art} alt={name} decoding="async" className="max-h-full max-w-full object-contain" />
      {cleanName === "Caveman" && <img src="/assets/rock for caveman to throw.svg" alt="" className="caveman-accessory caveman-rock absolute bottom-0 right-0 h-1/3 w-1/3 object-contain" />}
    </span>
  );
}

let blookEmojiCache: CustomEmoji[] | null = null;
function blookEmojis(): CustomEmoji[] {
  if (!blookEmojiCache) {
    const names = new Set([...liveCapsules, ...legacyCapsules].flatMap((capsule) => capsule.pool.map((reward) => reward.name)).concat(craftRecipes.map((recipe) => recipe.name)));
    blookEmojiCache = Array.from(names).map((name) => ({ id: `blook-${name}`, name: name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""), image: artFor(name) }));
  }
  return blookEmojiCache;
}

function BlookImg({ name, className }: { name: string; className: string }) {
  return <RewardArt name={name} art={artFor(name)} className={`${className} ${rewardEffectClassFor(name, rarityFor(name))}`} />;
}

function InventoryTab({
  player,
  equip,
  sell,
  massSell,
  toggleLock,
  toggleWish,
}: {
  player: Player;
  equip: (name: string) => void;
  sell: (name: string) => void;
  massSell: (quantities: Record<string, number>) => Promise<boolean>;
  toggleLock: (name: string) => void;
  toggleWish: (name: string) => void;
}) {
  const [selected, setSelected] = useState<Reward | null>(null);
  const [massSellOpen, setMassSellOpen] = useState(false);
  const [sellQuantities, setSellQuantities] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [rarityFilter, setRarityFilter] = useState("All");
  const [show, setShow] = useState<"all" | "owned" | "missing">("all");
  const locked = new Set(player.lockedBlooks || []);
  const filtering = Boolean(search.trim()) || rarityFilter !== "All" || show !== "all";
  const matches = (name: string, rarity: string, quantity: number) =>
    (!search.trim() || name.toLowerCase().includes(search.trim().toLowerCase()))
    && (rarityFilter === "All" || rarity === rarityFilter)
    && (show === "all" || (show === "owned" ? quantity > 0 : quantity === 0));

  const owned = (name: string) =>
    player.inventory.filter((item) => item === name).length;
  const tedReward: Reward = { name: "Ted", rarity: "Unique", weight: 0, art: artFor("Ted") };
  const tedQuantity = owned(tedReward.name);

  const catalog = liveCapsules.map((capsule) => {
    const shinyRewards = capsule.pool
      .filter((reward) => shinyEligibleNames.has(reward.name))
      .map((reward) => ({ ...reward, name: `Shiny ${reward.name}` }));
    return { ...capsule, pool: [...capsule.pool, ...shinyRewards] };
  });
  const assignedNames = new Set([
    ...catalog.flatMap((capsule) => capsule.pool.map((reward) => reward.name)),
    ...craftRecipes.map((recipe) => recipe.name),
    tedReward.name,
  ]);
  const otherItems = Array.from(new Set(player.inventory)).filter((name) => !assignedNames.has(name));
  const sellableBreads = Array.from(new Set(player.inventory)).filter((name) => !locked.has(name)).map((name) => ({
    name,
    rarity: rarityFor(name),
    available: Math.max(0, owned(name) - 1),
  })).filter((bread) => bread.available > 0);
  // "Sell all duplicates": every extra copy, or only those below Epic so rare pulls stay.
  const selectExtras = (belowEpic: boolean) => setSellQuantities(Object.fromEntries(sellableBreads
    .filter((bread) => !belowEpic || rarityOrder.indexOf(bread.rarity) < rarityOrder.indexOf("Epic"))
    .map((bread) => [bread.name, bread.available])));
  const lockedCount = Array.from(new Set(player.inventory)).filter((name) => locked.has(name) && owned(name) > 1).length;
  const filteredOther = otherItems.filter((name) => matches(name, rarityFor(name), owned(name)));
  const filteredCrafted = craftRecipes.filter((recipe) => matches(recipe.name, craftedRarityFor(recipe.name), owned(recipe.name)));
  const showTed = !filtering || matches(tedReward.name, tedReward.rarity, tedQuantity);
  const anyBagMatch = catalog.some((capsule) => capsule.pool.some((reward) => matches(reward.name, reward.rarity, owned(reward.name))));
  const rarityOptions = ["All", ...rarityOrder.filter((rarity) => rarity !== "Chroma")];
  const massSellTotal = sellableBreads.reduce((total, bread) => total + (sellQuantities[bread.name] || 0) * sellValueForBlook(bread.name, rarityFor(bread.name)), 0);

  return (
    <div className="flex flex-col lg:flex-row gap-8 items-start">
      {/* Main Breadlets Grid Area */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#3d91cd]/30 lg:pr-[25rem]">
          <div>
            <h1 className="page-sign text-4xl font-black text-white tracking-wide">My Breadlets</h1>
            <p className="mt-1 text-sm text-[#9cc8e8]">Click any Breadlet to view details, equip, or sell.</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => { setSellQuantities({}); setMassSellOpen(true); }} disabled={!sellableBreads.length} className="dark-action-button disabled:cursor-not-allowed disabled:opacity-40"><Coins size={18} aria-hidden="true" />Mass sell</button>
          </div>
        </div>
        <div className="inventory-filters lg:pr-[25rem]">
          <label className="inventory-search"><Search size={16} aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search Breadlets" aria-label="Search your Breadlets" /></label>
          <select value={rarityFilter} onChange={(event) => setRarityFilter(event.target.value)} aria-label="Filter by rarity">{rarityOptions.map((rarity) => <option key={rarity} value={rarity}>{rarity === "All" ? "All rarities" : rarity}</option>)}</select>
          <div className="inventory-show" role="group" aria-label="Show">{(["all", "owned", "missing"] as const).map((option) => <button key={option} type="button" aria-pressed={show === option} onClick={() => setShow(option)}>{option === "all" ? "All" : option === "owned" ? "Owned" : "Missing"}</button>)}</div>
        </div>

        <div className="mt-6 space-y-8">
          {catalog.map((capsule) => {
            const visible = capsule.pool.filter((reward) => matches(reward.name, reward.rarity, owned(reward.name)));
            if (filtering && !visible.length) return null;
            const base = capsule.pool.filter((reward) => !reward.name.startsWith("Shiny "));
            const collected = base.filter((reward) => owned(reward.name) > 0).length;
            return (
            <section key={capsule.name} className="p-1">
              <div className="mb-4 flex items-center justify-between border-b border-[#3d91cd]/20 pb-2">
                <h2 className="text-xl font-black text-[#bde8ff] flex items-center gap-2">
                  <img src={capsule.art} alt="" className="h-6 w-6 object-contain" />
                  {capsule.name}
                  <span className={`collection-progress${collected === base.length ? " is-complete" : ""}`} title="Breadlets collected from this bag (Shiny not counted)">{collected}/{base.length}</span>
                </h2>
                {capsule.retired && (
                  <span className="rounded-full bg-[#0c3b70] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#e9bd67] border border-[#e9bd67]/30">
                    Retired
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {visible.map((reward) => {
                  const quantity = owned(reward.name);
                  return (
                    <button
                      key={reward.name}
                      title={quantity ? `${reward.name} (x${quantity})` : `${reward.name} (not collected yet)`}
                      onClick={() => setSelected(reward)}
                        className={`blook-tilt relative flex aspect-square flex-col items-center justify-center transition-all p-0 cursor-pointer ${
                        quantity
                          ? "hover:-translate-y-1"
                          : ""
                      }`}
                    >
                      {quantity ? (
                        <RewardArt
                          name={reward.name}
                          art={artFor(reward.name)}
                          className={`h-full w-full ${rewardEffectClassFor(reward.name, reward.rarity)}`}
                        />
                      ) : (
                        <img src={artFor(reward.name)} alt="" className="locked-blook-art h-full w-full object-contain" />
                      )}

                      {/* Quantity badge */}
                      {quantity > 0 && (
                        <span className="absolute bottom-1.5 left-1.5 rounded-lg bg-[#22c55e] px-1.5 py-0.5 text-[10px] font-black text-white shadow">
                          {quantity}
                        </span>
                      )}

                      {locked.has(reward.name) && quantity > 0 && <span className="blook-lock-badge" title="Locked"><Lock size={11} aria-hidden="true" /></span>}
                      {!quantity && (player.wishlist || []).includes(reward.name) && <span className="blook-wish-badge" title="On your wishlist">★</span>}
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
            );
          })}
          {(!filtering || filteredOther.length > 0 || filteredCrafted.length > 0 || showTed) ? <section className="p-1">
            <div className="mb-4 flex items-center justify-between border-b border-[#d49a4a]/20 pb-2">
              <h2 className="text-xl font-black text-[#ffe2a0]">Other</h2>
              <span className="text-xs font-bold uppercase tracking-widest text-[#d7b88c]">Extra, secret, and crafted Breadlets</span>
            </div>
            <div className="space-y-6">
              {filteredOther.length > 0 && <div>
                <h3 className="mb-3 text-sm font-black uppercase tracking-widest text-[#d7b88c]">Other rewards</h3>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
                  {filteredOther.map((name) => {
                    const reward: Reward = { name, rarity: rarityFor(name), weight: 0, art: artFor(name) };
                    const quantity = owned(name);
                    return (
                      <button
                        key={name}
                        type="button"
                        title={`${name} · ${reward.rarity} (x${quantity})`}
                        onClick={() => setSelected(reward)}
                        className="blook-tilt relative flex aspect-square flex-col items-center justify-center rounded-2xl bg-black/25 p-2"
                      >
                        <RewardArt name={name} art={reward.art || artFor(name)} className={`h-full w-full ${rewardEffectClassFor(name, reward.rarity)}`} />
                        <span className="absolute bottom-1 left-1 rounded-md bg-[#e9bd67] px-1.5 py-0.5 text-[9px] font-black text-[#29170c]">{reward.rarity}</span>
                        <span className="absolute bottom-1 right-1 rounded-lg bg-emerald-500 px-1.5 py-0.5 text-[10px] font-black text-white">{quantity}</span>
                        {player.equipped === name && <span className="absolute right-1 top-1 rounded-md bg-amber-300 px-1 text-[9px] font-black text-slate-950">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>}
              {showTed && <div>
                <h3 className="mb-3 text-sm font-black uppercase tracking-widest text-fuchsia-200">Secrets</h3>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
                  <button
                    type="button"
                    title={tedQuantity ? `Ted · Unique (x${tedQuantity})` : "Ted · Unique (Secret)"}
                    onClick={() => tedQuantity && setSelected(tedReward)}
                    className={`relative flex aspect-square flex-col items-center justify-center rounded-2xl p-2 transition ${tedQuantity ? "bg-fuchsia-950/40 hover:-translate-y-1" : "cursor-not-allowed bg-black/40 opacity-60"}`}
                  >
                    {tedQuantity ? (
                      <RewardArt name={tedReward.name} art={tedReward.art || artFor(tedReward.name)} className={`h-full w-full ${rewardEffectClassFor(tedReward.name, tedReward.rarity)}`} />
                    ) : (
                      <div className="relative flex h-full w-full items-center justify-center">
                        <span className="h-full w-full rounded-xl bg-black/80" />
                        <Lock size={16} className="absolute text-white/80" />
                      </div>
                    )}
                    <span className="absolute bottom-1 left-1 rounded-md bg-fuchsia-300 px-1.5 py-0.5 text-[9px] font-black text-slate-950">Unique</span>
                    {tedQuantity > 0 && <span className="absolute bottom-1 right-1 rounded-lg bg-emerald-500 px-1.5 py-0.5 text-[10px] font-black text-white">{tedQuantity}</span>}
                    {player.equipped === tedReward.name && <span className="absolute right-1 top-1 rounded-md bg-amber-300 px-1 text-[9px] font-black text-slate-950">✓</span>}
                  </button>
                </div>
              </div>}
              {filteredCrafted.length > 0 && <div>
                <h3 className="mb-3 text-sm font-black uppercase tracking-widest text-[#ead4ff]">Crafted</h3>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
                  {filteredCrafted.map((recipe) => {
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
              </div>}
            </div>
          </section> : null}
          {filtering && !anyBagMatch && !filteredOther.length && !filteredCrafted.length && !showTed && <p className="py-10 text-center font-bold text-white/70">No Breadlets match those filters.</p>}
        </div>
      </div>

      {massSellOpen && <div className="modal-layer fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 px-4 py-6 backdrop-blur-sm"><div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-[#3d91cd] bg-[#103f75] p-5"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-widest text-[#9cc8e8]">Collection</p><h2 className="text-2xl font-black">Mass sell Breadlets</h2></div><button onClick={() => setMassSellOpen(false)} className="rounded-lg bg-[#18558f] px-3 py-2 font-bold">Close</button></div><p className="mt-2 text-sm text-[#9cc8e8]">Choose extra copies to sell. One copy of every Breadlet is always kept{lockedCount ? `, and ${lockedCount} locked Breadlet${lockedCount === 1 ? " is" : "s are"} left out` : ""}.</p><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => selectExtras(true)} className="rounded-lg bg-[#18558f] px-3 py-2 text-sm font-black">All extras below Epic</button><button type="button" onClick={() => selectExtras(false)} className="rounded-lg bg-[#18558f] px-3 py-2 text-sm font-black">All extras</button></div><div className="mt-4 flex-1 space-y-2 overflow-y-auto">{sellableBreads.map((bread) => <label key={bread.name} className="flex items-center gap-3 rounded-xl bg-[#0c3b70] p-3"><RewardArt name={bread.name} art={artFor(bread.name)} className="h-12 w-12 shrink-0" /><span className="min-w-0 flex-1 truncate font-bold">{bread.name}<small className="ml-2 text-[#9cc8e8]">up to {bread.available}</small></span><input aria-label={`${bread.name} sell quantity`} type="number" min="0" max={bread.available} value={sellQuantities[bread.name] || 0} onChange={(event) => setSellQuantities({ ...sellQuantities, [bread.name]: Math.min(bread.available, Math.max(0, Math.floor(Number(event.target.value) || 0))) })} className="w-20 rounded-lg bg-[#072a54] px-3 py-2 text-white" /></label>)}</div><button disabled={!massSellTotal} onClick={async () => { if (!window.confirm(`Sell the selected Breadlets for ${massSellTotal.toLocaleString()} Bread Bucks?`)) return; if (await massSell(sellQuantities)) setMassSellOpen(false); }} className="bazaar-buy-button mt-4 disabled:opacity-40">Sell for <img src="/assets/Bread%20bucks.svg" alt="" />{massSellTotal.toLocaleString()}</button></div></div>}

      {/* Selected Bread Detail Modal */}
      {selected && (
        <BlookDetail
          reward={selected}
          quantity={owned(selected.name)}
          equipped={player.equipped === selected.name}
          onClose={() => setSelected(null)}
          equip={equip}
          sell={sell}
          locked={locked.has(selected.name)}
          wished={(player.wishlist || []).includes(selected.name)}
          toggleLock={() => toggleLock(selected.name)}
          toggleWish={() => toggleWish(selected.name)}
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
  locked,
  wished,
  toggleLock,
  toggleWish,
}: {
  reward: Reward;
  quantity: number;
  equipped: boolean;
  onClose: () => void;
  equip: (name: string) => void;
  sell: (name: string) => void;
  locked: boolean;
  wished: boolean;
  toggleLock: () => void;
  toggleWish: () => void;
}) {
  return (
    <div className="modal-layer fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 px-5 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl border border-[#3d91cd] bg-[#103f75] p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[#bde8ff]">
              Bread details
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
            value={`${sellValueForBlook(reward.name, reward.rarity)} Bread Bucks`}
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
            disabled={quantity <= 1 || locked}
            title={locked ? "Unlock this Breadlet to sell it" : undefined}
            onClick={() => {
              if (
                window.confirm(
                  `Sell ${reward.name} for ${sellValueForBlook(reward.name, reward.rarity)} Bread Bucks?`,
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
          {quantity > 0
            ? <button type="button" onClick={toggleLock} className="col-span-2 flex items-center justify-center gap-2 rounded-xl border border-[#e9bd67]/60 px-4 py-3 text-sm font-black text-[#e9bd67]"><Lock size={16} aria-hidden="true" />{locked ? "Unlock (allow selling, recycling and trading)" : "Lock (protect from selling, recycling and trading)"}</button>
            : <button type="button" onClick={toggleWish} className="col-span-2 rounded-xl border border-[#e9bd67]/60 px-4 py-3 text-sm font-black text-[#e9bd67]">{wished ? "★ On your wishlist (tap to remove)" : "☆ Add to wishlist: get told when one is listed on the Bazaar"}</button>}
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
    Breadled: ["#facc15", "#f0abfc", "#67e8f9", "#ffffff"],
  };
  const counts: Record<string, number> = { Common: 12, Uncommon: 16, Rare: 20, Epic: 24, Legendary: 28, Mythic: 32, Unique: 36, Breadled: 40 };
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
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); confirm(); }
    };
    // Added on the next tick so the Space press that opened this doesn't also confirm it.
    const timer = window.setTimeout(() => window.addEventListener("keydown", onKey), 0);
    return () => { window.clearTimeout(timer); window.removeEventListener("keydown", onKey); };
  }, [confirm]);
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
  spin: () => Promise<(typeof wheelRewards)[number] | null>;
  isGuest: boolean;
}) {
  const [oddsOpen, setOddsOpen] = useState(false);
  const [phase, setPhase] = useState<"ready" | "spinning" | "result">("ready");
  const [result, setResult] = useState<(typeof wheelRewards)[number] | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [track, setTrack] = useState<(typeof wheelRewards)[number][]>(() => Array.from({ length: 62 }, () => wheelRewards[Math.floor(Math.random() * wheelRewards.length)]));
  const [beltOffset, setBeltOffset] = useState(0);
  const winnerIndex = 54;
  const [now, setNow] = useState(() => Date.now());
  const spunAtMs = player.wheelSpunAt ? new Date(player.wheelSpunAt).getTime() : 0;
  const cooldownActive = !isGuest && spunAtMs + 3600000 > now;
  useEffect(() => {
    if (!cooldownActive) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [cooldownActive]);
  const waitMs = isGuest ? 0 : Math.max(0, spunAtMs + 3600000 - now);
  const locked = waitMs > 0;
  const waitLabel = `${String(Math.floor(waitMs / 60000)).padStart(2, "0")}:${String(Math.floor((waitMs % 60000) / 1000)).padStart(2, "0")}`;
  const spinNow = async () => {
    if (phase === "spinning" || locked) return;
    setResult(null);
    setBeltOffset(0);
    setPhase("spinning");
    const reward = await spin();
    if (!reward) {
      setPhase("ready");
      return;
    }
    setTrack(Array.from({ length: 62 }, (_, index) => index === winnerIndex ? reward : wheelRewards[Math.floor(Math.random() * wheelRewards.length)]));
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      if (viewport) setBeltOffset(viewport.clientWidth / 2 - winnerIndex * 120 - 56);
    }));
    window.setTimeout(() => {
      setResult(reward);
      setPhase("result");
    }, 7000);
  };
  const resultIcon = result?.type === "tokens"
    ? "/assets/Bread%20bucks.svg"
    : materialArtFor(result?.material || "Gold");
  return (
    <div className="max-w-6xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#bde8ff]">{isGuest ? "Claim Bread Bucks · unlimited free claims" : "Claim Bread Bucks · once every hour"}</p>
          <h1 className="page-sign mt-2 text-4xl font-black">Claim Bread Bucks</h1>
        </div>
        <button type="button" onClick={() => setOddsOpen(true)} aria-label="View possible prizes and chances" title="Possible prizes and chances" className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-sky-300/50 bg-[#10182b] text-lg font-black text-sky-200 shadow-lg transition hover:bg-sky-300 hover:text-slate-950">i</button>
      </div>
      <div className="mt-8">
        <button onClick={spinNow} disabled={phase === "spinning" || locked} className="sidebar-dark-action rounded-xl bg-amber-300 px-10 py-3 text-lg font-black text-slate-950 shadow-lg transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50">
          {locked ? `Next claim in ${waitLabel}` : phase === "spinning" ? "Claiming..." : "Claim Bread Bucks"}
        </button>
        <div>
          {phase === "spinning" && <div className="modal-layer fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 px-4 py-6 backdrop-blur-sm">
            <section role="dialog" aria-modal="true" aria-label="Claiming Bread Bucks" className="w-full max-w-6xl rounded-2xl border border-[#3c3a34] bg-[#13120F] p-4 text-center sm:p-7">
              <div ref={viewportRef} className="roulette-viewport relative h-36 overflow-hidden border-y border-white/10 bg-[#090e1b] sm:h-44">
                <div className="roulette-pointer" />
                <div className="roulette-belt" style={{ transform: `translateX(${beltOffset}px)`, transitionDuration: "6.5s" }}>
                  {track.map((reward, index) => {
                    const rarity = wheelRarityFor(reward);
                    const icon = reward.type === "tokens" ? "/assets/Bread%20bucks.svg" : materialArtFor(reward.material || "Gold");
                    return <div key={`${index}-${reward.label}`} className={`roulette-prize ${rarityTileClass(rarity)}`}>
                      <img src={icon} alt="" className="h-9 w-9 object-contain sm:h-10 sm:w-10" />
                      <span className="max-w-full truncate text-[9px] font-black sm:text-[10px]">{reward.type === "tokens" ? reward.amount.toLocaleString() : `x${reward.amount}`} {reward.type === "tokens" ? "Bread Bucks" : reward.material}</span>
                      <span className="text-[8px] font-bold opacity-70">{rarity}</span>
                    </div>;
                  })}
                </div>
              </div>
              <p role="status" className="mt-5 text-sm font-bold">Your reward is on the way...</p>
            </section>
          </div>}
          {result && phase === "result" && (
            <div className="modal-layer fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 px-4 py-6 backdrop-blur-sm">
              <div role="dialog" aria-modal="true" aria-labelledby="crate-result-title" className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-[#3c3a34] bg-[#13120F] p-6 text-center text-white shadow-2xl">
              <RewardBurst rarity={wheelRarityFor(result)} />
              <img src={resultIcon} alt="" className="reveal-win-slam relative z-10 mx-auto h-28 w-28 object-contain" />
              <div className="reveal-win-slam relative z-10 mt-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-white/50">You won · {wheelRarityFor(result)}</p>
                <h2 id="crate-result-title" className="mt-2 text-2xl font-black text-white">{result.type === "tokens" ? `${result.amount.toLocaleString()} Bread Bucks` : `${result.amount} ${result.material}`}</h2>
              </div>
              <button onClick={() => { setResult(null); setPhase("ready"); }} className="relative z-10 mt-6 w-full rounded-xl bg-sky-400 px-5 py-3 font-black text-slate-950 hover:bg-sky-300">Collect reward</button>
              </div>
            </div>
          )}
        </div>
      </div>
      {oddsOpen && <div className="modal-layer fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 px-4 py-6 backdrop-blur-sm">
        <section role="dialog" aria-modal="true" aria-labelledby="crate-odds-title" className="w-full max-w-md rounded-2xl border border-sky-300/30 bg-[#10182b] p-5 text-white shadow-2xl sm:p-6">
          <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
            <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-300">Claim Bread Bucks</p><h2 id="crate-odds-title" className="mt-1 text-2xl font-black">Possible prizes</h2></div>
            <button onClick={() => setOddsOpen(false)} aria-label="Close prize chances" className="flex h-10 w-10 items-center justify-center rounded-lg text-xl text-white/60 hover:bg-white/10 hover:text-white">×</button>
          </div>
          <div className="mt-4 space-y-2">
            {wheelRewards.map((reward) => {
              const rarity = wheelRarityFor(reward);
              const icon = reward.type === "tokens" ? "/assets/Bread%20bucks.svg" : materialArtFor(reward.material || "Gold");
              return <div key={reward.label} className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${rarityTileClass(rarity)}`}>
                <img src={icon} alt="" className="h-9 w-9 shrink-0 object-contain" />
                <span className="min-w-0 flex-1 truncate text-sm font-bold">{reward.type === "tokens" ? `${reward.amount.toLocaleString()} Bread Bucks` : `${reward.amount} ${reward.material}`}</span>
                <span className="text-xs font-black">{reward.chance}%</span>
              </div>;
            })}
          </div>
          <p className="mt-4 flex items-center gap-2 border-t border-white/10 pt-3 text-sm font-bold text-amber-100"><img src="/assets/Bread%20bucks.svg" alt="" className="h-6 w-6" />Balance: {player.tokens.toLocaleString()} tokens</p>
        </section>
      </div>}
    </div>
  );
}

// String lights across the top of the Bazaar: two sagging wires, 14 bulbs each, placed on a curve
// that matches the wire drawn in CSS (.bazaar-lights::before/::after).
const bazaarBulbs = Array.from({ length: 28 }, (_, index) => {
  const swag = Math.floor(index / 14);
  const t = ((index % 14) + 0.5) / 14;
  return { x: swag * 50 + t * 50, y: 6 + 34 * (1 - (2 * t - 1) ** 2) };
});

// Bazaar stall roof color for each rarity.
const stallColors: Record<string, string> = {
  Common: "#8a8f98",
  Uncommon: "#3fae5a",
  Rare: "#2f7fe0",
  Epic: "#9b4fd8",
  Legendary: "#f0a020",
  Mythic: "#e2364a",
  Unique: "#17b8b0",
  Breadled: "#ff6fb5",
};

function Bazaar({
  player,
  createListing,
  cancelListing,
  openListing,
  buyListing,
  setPlayerListings,
  isGuest,
  toggleWish,
}: {
  toggleWish: (name: string) => void;
  player: Player;
  createListing: (blook: string, price: number) => void;
  cancelListing: (listing: Listing) => void | Promise<void>;
  openListing: (listing: Listing) => void;
  buyListing: (listing: Listing) => void | Promise<void>;
  setPlayerListings?: (listings: Listing[]) => void;
  isGuest: boolean;
}) {
  const [blook, setBlook] = useState(player.inventory[0]);
  const [price, setPrice] = useState("10");
  const [search, setSearch] = useState("");
  const [rarity, setRarity] = useState("All rarities");
  const [pack, setPack] = useState("All packs");
  const packOf = (blook: string) => [...liveCapsules, ...legacyCapsules].find((capsule) => capsule.pool.some((reward) => reward.name === blook.replace(/^Shiny /, "")))?.name || "Other";
  const packNames = [...liveCapsules.map((capsule) => capsule.name), "Other"];
  const [sortOrder, setSortOrder] = useState("Newest");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [onlyWishlist, setOnlyWishlist] = useState(false);
  const ownedNames = useMemo(() => new Set(player.inventory), [player.inventory]);
  const wishlist = player.wishlist || [];
  const [showForm, setShowForm] = useState(false);
  const [view, setView] = useState<"browse" | "mine">("browse");
  const [marketListings, setMarketListings] = useState<Listing[]>(player.listings);
  const [selectedBlook, setSelectedBlook] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
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

    let reloadTimer: number | undefined;
    const channel = supabase
      .channel("marketplace-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "marketplace_listings" },
        () => {
          window.clearTimeout(reloadTimer);
          reloadTimer = window.setTimeout(() => void loadListings(), 2000);
        }
      )
      .subscribe();

    return () => {
      window.clearTimeout(reloadTimer);
      supabase.removeChannel(channel);
    };
  }, [loadListings, supabase]);

  useEffect(() => {
    if (player.listings && player.listings.length > 0) {
      setMarketListings(player.listings);
    }
  }, [player.listings]);

  // Locked Breadlets can't be listed until they're unlocked in My Breadlets.
  const ownedBlooks = player.inventory.filter(
    (name, index, items) => items.indexOf(name) === index && !(player.lockedBlooks || []).includes(name),
  );
  const [lastSale, setLastSale] = useState<number | null>(null);
  useEffect(() => {
    if (!showForm || !blook) return;
    let cancelled = false;
    setLastSale(null);
    void fetch(`/api/marketplace?history=${encodeURIComponent(blook)}`).then((response) => response.ok ? response.json() : []).then((sales) => {
      if (!cancelled && Array.isArray(sales) && sales.length) setLastSale(Number(sales[0].price) || null);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [blook, showForm]);
  const filteredListings = marketListings.filter((listing) => {
    const matchesSearch = listing.blook.toLowerCase().includes(search.toLowerCase());
    const matchesRarity = rarity === "All rarities" || rarityFor(listing.blook) === rarity;
    const matchesPack = pack === "All packs" || packOf(listing.blook) === pack;
    const matchesView = view === "browse" || listing.seller === player.username;
    const matchesMissing = !onlyMissing || !ownedNames.has(listing.blook);
    const matchesWishlist = !onlyWishlist || wishlist.includes(listing.blook);
    return matchesSearch && matchesRarity && matchesPack && matchesView && matchesMissing && matchesWishlist;
  });
  const listings = [...filteredListings].sort((left, right) => {
    if (sortOrder === "Lowest price") return left.price - right.price;
    if (sortOrder === "Highest price") return right.price - left.price;
    return 0;
  });
  const blookGroups = Array.from(new Set(listings.map((listing) => listing.blook)));

  useEffect(() => {
    setSelectedBlook("");
    setDetailsOpen(false);
  }, [search, rarity, pack, view, onlyMissing, onlyWishlist]);

  return (
    <div className="bazaar-market bazaar-scene min-h-full">
      <div className="bazaar-lights" aria-hidden="true">{bazaarBulbs.map((bulb, index) => <span key={index} style={{ left: `${bulb.x}%`, top: bulb.y, animationDelay: `${(index % 7) * 0.4}s` }} />)}</div>
      <h1 className="bazaar-title bazaar-sign"><span>Bazaar</span></h1>
      <div className="bazaar-toolbar">
        <label className="bazaar-search-field">
          <Search size={18} aria-hidden="true" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search Breadlets" aria-label="Search Breadlets" />
        </label>
        <select value={rarity} onChange={(event) => setRarity(event.target.value)} aria-label="Filter by rarity" className="bazaar-filter-control">
          <option>All rarities</option>
          {["Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythic", "Unique", "Breadled"].map((item) => <option key={item}>{item}</option>)}
        </select>
        <select value={pack} onChange={(event) => setPack(event.target.value)} aria-label="Filter by pack" className="bazaar-filter-control">
          <option>All packs</option>
          {packNames.map((item) => <option key={item}>{item}</option>)}
        </select>
        <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} aria-label="Sort listings" className="bazaar-filter-control">
          <option>Newest</option>
          <option>Lowest price</option>
          <option>Highest price</option>
        </select>
        <button onClick={() => setShowForm(!showForm)} className="bazaar-list-button">+ List an item</button>
      </div>
      <div className="bazaar-quick-filters">
        <button type="button" aria-pressed={onlyMissing} onClick={() => setOnlyMissing(!onlyMissing)}>Only ones I don&apos;t own</button>
        <button type="button" aria-pressed={onlyWishlist} onClick={() => setOnlyWishlist(!onlyWishlist)}>★ My wishlist{wishlist.length ? ` (${wishlist.length})` : ""}</button>
      </div>
      <div className="bazaar-view-tabs mt-4 flex rounded-2xl border p-1">
        <button aria-pressed={view === "browse"} onClick={() => setView("browse")} className="flex-1 rounded-xl px-4 py-3 font-black">Browse</button>
        <button aria-pressed={view === "mine"} onClick={() => setView("mine")} className="flex-1 rounded-xl px-4 py-3 font-bold">My listings</button>
      </div>
      {showForm && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            createListing(blook, Number(price));
            setShowForm(false);
          }}
          className="bazaar-list-form mt-4 grid gap-3 md:grid-cols-[1fr_180px_auto]"
        >
          <select value={blook} onChange={(event) => setBlook(event.target.value)} aria-label="Breadlet to list" className="bazaar-filter-control">
            {ownedBlooks.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
          <input
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            type="number"
            min="1"
            max={MAX_MARKETPLACE_PRICE}
            step="1"
            className="bazaar-filter-control"
            placeholder="Price"
            aria-label={`Listing price, maximum ${MAX_MARKETPLACE_PRICE.toLocaleString()} Bread Bucks`}
          />
          <button className="bazaar-buy-button px-6">List Breadlet</button>
          {lastSale !== null && <p className="text-sm font-black md:col-span-3">Last sold for {lastSale.toLocaleString()} Bread Bucks.</p>}
          <p className="text-sm font-bold opacity-80 md:col-span-3">10% Bazaar fee: if it sells, you get {Math.max(0, Math.floor(Number(price) || 0) - Math.floor((Math.floor(Number(price) || 0)) * BAZAAR_FEE_RATE)).toLocaleString()} Bread Bucks.</p>
        </form>
      )}
      {blookGroups.length ? (
        <section className="bazaar-blook-grid mt-5" aria-label="Breadlets for sale">
          {blookGroups.map((name) => {
            const blookListings = listings.filter((listing) => listing.blook === name);
            const quantity = blookListings.reduce((total, listing) => total + Math.max(1, Number(listing.quantity) || 1), 0);
            const lowest = Math.min(...blookListings.map((listing) => listing.price));
            return (
              <button key={name} type="button" onClick={() => { setSelectedBlook(name); setDetailsOpen(true); }} className="bazaar-stall" style={{ "--stall": stallColors[rarityFor(name)] || stallColors.Common } as React.CSSProperties}>
                <span className="bazaar-stall-roof" aria-hidden="true" />
                <span className="bazaar-stall-body">
                  <span className="bazaar-stall-art"><BlookImg name={name} className="h-full w-full" /></span>
                  <span className="bazaar-stall-counter">
                    <span className="bazaar-stall-name">{wishlist.includes(name) ? "★ " : ""}{name}</span>
                    <span className="bazaar-stall-meta">{rarityFor(name)} · {quantity} listed</span>
                  </span>
                </span>
                <span className="bazaar-price-sign"><img src="/assets/Bread%20bucks.svg" alt="" />from {lowest.toLocaleString()}</span>
              </button>
            );
          })}
        </section>
      ) : (
        <p className="bazaar-empty mt-6 rounded-2xl border p-8 text-center">{view === "mine" ? "You have no active listings." : "No listings match your search yet."}</p>
      )}
      <div className="bazaar-street" aria-hidden="true" />
      {detailsOpen && <BlookListingsModal
        blook={selectedBlook}
        listings={listings.filter((listing) => listing.blook === selectedBlook)}
        close={() => setDetailsOpen(false)}
        player={player}
        buy={buyListing}
        cancelListing={cancelListing}
        wished={wishlist.includes(selectedBlook)}
        toggleWish={() => toggleWish(selectedBlook)}
      />}
    </div>
  );
}

const listedAgo = (iso?: string) => {
  if (!iso) return "Listed recently";
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "Listed just now";
  if (minutes < 60) return `Listed ${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Listed ${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Listed yesterday" : `Listed ${days} days ago`;
};

// The best odds of pulling a Breadlet from any live pack, e.g. "Common (24%)".
const rarityWithOdds = (blook: string) => {
  const name = blook.replace(/^Shiny /, "");
  const odds = liveCapsules.flatMap((capsule) => capsule.pool.filter((reward) => reward.name === name).map((reward) => chanceFor(capsule, reward)));
  const best = odds.length ? Math.max(...odds) : 0;
  return best ? `${rarityFor(blook)} (${best >= 1 ? Math.round(best) : +best.toFixed(2)}%)` : rarityFor(blook);
};

function BlookListingsModal({
  blook,
  listings,
  close,
  player,
  buy,
  cancelListing,
  wished,
  toggleWish,
}: {
  blook: string;
  listings: Listing[];
  close: () => void;
  player: Player;
  buy: (listing: Listing) => void | Promise<void>;
  cancelListing: (listing: Listing) => void | Promise<void>;
  wished: boolean;
  toggleWish: () => void;
}) {
  const [sales, setSales] = useState<{ price: number; soldAt: string }[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/marketplace?history=${encodeURIComponent(blook)}`).then((response) => response.ok ? response.json() : []).then((rows) => {
      if (!cancelled) setSales(Array.isArray(rows) ? rows : []);
    }).catch(() => { if (!cancelled) setSales([]); });
    return () => { cancelled = true; };
  }, [blook]);
  const averageSale = sales?.length ? Math.round(sales.reduce((total, sale) => total + sale.price, 0) / sales.length) : 0;
  const offers = [...listings].sort((left, right) => left.price - right.price);
  const [selectedId, setSelectedId] = useState(offers[0]?.id);
  const [busy, setBusy] = useState(false);
  const selected = offers.find((offer) => offer.id === selectedId) || offers[0];
  const listedCount = offers.reduce((total, offer) => total + Math.max(1, Number(offer.quantity) || 1), 0);
  const ownListing = Boolean(selected && selected.seller === player.username);
  const remaining = selected ? player.tokens - selected.price : player.tokens;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);
  // Close once the last listing is bought or taken down.
  useEffect(() => { if (!offers.length) close(); }, [offers.length, close]);

  const act = async () => {
    if (!selected || busy) return;
    setBusy(true);
    await (ownListing ? cancelListing(selected) : buy(selected));
    setBusy(false);
  };

  return (
    <div className="modal-layer fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 px-4 py-6" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="blook-listings-title" className="bazaar-offers">
        <div className="bazaar-offers-header">
          <div className="bazaar-offers-art"><BlookImg name={blook} className="h-full w-full" /></div>
          <div className="min-w-0 flex-1">
            <h2 id="blook-listings-title" className="truncate text-3xl font-black">{blook}</h2>
            <p className="text-base font-bold opacity-80">{rarityWithOdds(blook)}</p>
            <p className="text-base font-black">{listedCount.toLocaleString()} listed</p>
            <button type="button" onClick={toggleWish} className="bazaar-wish-toggle" aria-pressed={wished}>{wished ? "★ On your wishlist" : "☆ Add to wishlist"}</button>
          </div>
          <button type="button" onClick={close} aria-label="Close listings" className="bazaar-offers-close">×</button>
        </div>
        <div className="bazaar-price-history">
          <p className="text-xs font-black uppercase tracking-widest opacity-70">Recent sales</p>
          {sales === null ? <p className="text-sm font-bold opacity-70">Loading…</p> : sales.length ? <>
            <p className="text-sm font-bold">Average of the last {sales.length}: <b>{averageSale.toLocaleString()}</b> Bread Bucks</p>
            <div className="bazaar-price-chips">{sales.map((sale, index) => <span key={index} title={new Date(sale.soldAt).toLocaleString()}>{sale.price.toLocaleString()}</span>)}</div>
          </> : <p className="text-sm font-bold opacity-70">No sales yet.</p>}
        </div>
        <div className="bazaar-offers-list" role="listbox" aria-label={`${blook} listings`}>
          {offers.map((offer) => (
            <button key={offer.id} type="button" role="option" aria-selected={offer.id === selected?.id} onClick={() => setSelectedId(offer.id)} className="bazaar-offer-row">
              <span className="bazaar-offer-avatar">{offer.sellerBlook ? <BlookImg name={offer.sellerBlook} className="h-full w-full" /> : <img src="/assets/breadlet-logo.svg" alt="" className="h-full w-full object-contain" />}</span>
              <span className="min-w-0 flex-1 text-left">
                <strong className="block truncate text-lg">{offer.seller}{offer.seller === player.username ? " (you)" : ""}</strong>
                <small className="block text-sm opacity-75">{listedAgo(offer.listedAt)}{Number(offer.quantity) > 1 ? ` · ${offer.quantity} available` : ""}</small>
              </span>
              <span className="bazaar-offer-price"><img src="/assets/Bread%20bucks.svg" alt="Bread Bucks" />{offer.price.toLocaleString()}</span>
            </button>
          ))}
        </div>
        {selected && (
          <footer className="mt-4">
            <button type="button" onClick={() => void act()} disabled={busy || (!ownListing && remaining < 0)} className={ownListing ? "bazaar-takedown-button" : "bazaar-buy-button"}>
              {ownListing ? "Take down listing" : remaining < 0 ? "Not enough Bread Bucks" : <>Buy for <img src="/assets/Bread%20bucks.svg" alt="" />{selected.price.toLocaleString()}</>}
            </button>
            {!ownListing && <p className="mt-2 text-center text-sm font-bold opacity-80">From <b>{selected.seller}</b> · you&apos;ll have {Math.max(0, remaining).toLocaleString()} Bread Bucks left</p>}
          </footer>
        )}
      </section>
    </div>
  );
}

const REVEAL_GLOW: Record<string, string> = { Common: "#cbd5e1", Uncommon: "#4ade80", Rare: "#38bdf8", Epic: "#c084fc", Legendary: "#fbbf24", Mythic: "#f472b6", Unique: "#fb923c", Breadled: "#f43f5e", Chroma: "#22d3ee" };

// Pack opening over a blurred copy of the shop: the bag pops in, shakes, then drops off the bottom of
// the screen to reveal the Breadlet, which stands on a soft ground shadow in a rarity-colored glow.
// Click anywhere to skip ahead, then to close (or to stop auto open).
function RevealModal({
  reveal,
  quick,
  autoCount,
  onClick,
}: {
  reveal: {
    capsule: Capsule;
    reward: Reward;
    track: Reward[];
    winnerIndex: number;
    phase: "charging" | "spinning" | "result";
  };
  quick: boolean;
  autoCount: number | null;
  onClick: () => void;
}) {
  const { capsule, reward, phase } = reveal;
  const done = phase === "result";
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onClick();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClick]);
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label="Pack opening. Click to continue."
      className="modal-layer reveal-overlay fixed inset-0 z-[9999] flex min-h-screen cursor-pointer select-none flex-col items-center justify-center gap-4 overflow-hidden px-4 py-6"
      style={{ "--rs": quick ? 0.4 : 1, "--glow": REVEAL_GLOW[reward.rarity] || "#cbd5e1" } as React.CSSProperties}
    >
      {autoCount !== null && <p className="reveal-hud">🔁 Auto opening · {autoCount} opened · click anywhere to stop</p>}
      <div className="reveal-stage">
        <span className={`reveal-glow ${phase === "charging" ? "" : "reveal-glow-on"}`} aria-hidden="true" />
        <span className="reveal-shadow" aria-hidden="true" />
        <div className={`reveal-prize reveal-prize-${phase}`}>
          {done && <RewardBurst rarity={reward.rarity} />}
          <RewardArt name={reward.name} art={reward.art || artFor(reward.name)} className={`h-full w-full ${rewardEffectClassFor(reward.name, reward.rarity)}`} />
        </div>
        {!done && (
          <div className={`reveal-bag ${phase === "spinning" ? "reveal-bag-drop" : "reveal-bag-appear"}`}>
            <img src={capsule.art} alt={capsule.name} className="reveal-bag-wiggle" />
          </div>
        )}
      </div>
      <div className={`reveal-result ${done ? "reveal-result-in" : ""}`} aria-hidden={!done}>
        <p className="text-xs font-black uppercase tracking-widest text-white/70">{capsule.name}</p>
        <h1 className="text-4xl font-black text-white">{reward.name}</h1>
        <span className="reveal-rarity">{reward.rarity}</span>
      </div>
      {done && autoCount === null && <p className="reveal-hint">Click anywhere to continue</p>}
    </div>
  );
}
function ListingModal({ listing, close, buy, isGuest }: { listing: Listing; close: () => void; buy: (listing: Listing) => void; isGuest: boolean }) {
  return (
    <div className="modal-layer fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 px-5 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl border border-[#3d91cd] bg-[#103f75] p-6 text-center shadow-2xl">
        <p className="text-xs font-bold uppercase tracking-widest text-[#bde8ff]">Bazaar listing</p>
        <div className="mt-5 flex h-40 items-center justify-center rounded-2xl bg-[#0c3b70] p-4 border border-[#3d91cd]/30">
          <BlookImg name={listing.blook} className="h-full w-full" />
        </div>
        <h2 className="mt-4 text-2xl font-black text-white">{listing.blook}</h2>
        <p className="mt-1 text-sm text-[#9cc8e8]">{rarityFor(listing.blook)} · Seller: {listing.seller}</p>
        <p className="mt-3 text-xl font-black text-[#ffe2a0]">{isGuest ? "FREE" : `${listing.price} Bread Bucks`}</p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button onClick={close} className="rounded-xl bg-[#18558f] px-3 py-3 text-sm font-bold text-[#bde8ff] hover:bg-[#24649c]">Close</button>
          <button onClick={() => buy(listing)} className="rounded-xl bg-[#39a8f5] px-3 py-3 text-sm font-black text-[#031426] hover:bg-[#73c8ff]">Buy Bread</button>
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
              Specific Bread chances
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
          {sortByRarity(capsule.pool).map((reward) => (
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
              {reward.rotation && !isRewardActive(reward) ? (
                // Daily rotation: only one of these is in the pack each day.
                <b className="text-xs text-[#bde8ff] opacity-80">{(() => { const days = (reward.rotation.slot - rotationSlotFor(reward.rotation.size) + reward.rotation.size) % reward.rotation.size; return days === 1 ? "Back tomorrow" : `Back in ${days} days`; })()}</b>
              ) : (
                <b className="text-[#bde8ff] text-base">
                  {reward.rotation && <span className="mr-2 rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-200">Today</span>}
                  {chanceFor(capsule, reward).toFixed(chanceFor(capsule, reward) < 0.01 ? 3 : 2)}%
                </b>
              )}
            </div>
          ))}
        </div>
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
  confirm: () => Promise<boolean> | boolean;
  close: () => void;
}) {
  const [dismantling, setDismantling] = useState(false);

  return (
    <div className="modal-layer fixed inset-0 z-[9999] flex min-h-screen items-center justify-center bg-black/70 px-5 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="dismantle-confirm-title" className="w-full max-w-sm rounded-3xl border-2 border-[#3c3a34] bg-[#13120F] p-6 text-center text-white shadow-2xl">
        <p className="text-xs font-bold uppercase tracking-widest text-[#e9bd67]">Recycle Bread</p>
        <img src={artFor(name)} alt={name} className="mx-auto mt-4 h-28 w-28 object-contain" />
        <h2 id="dismantle-confirm-title" className="mt-3 text-2xl font-black">Dismantle {name}?</h2>
        <p className="mt-2 text-sm text-[#3B1F0E]">This removes one copy and returns:</p>
        <div className="mt-4 flex justify-center gap-3">
          {bundleEntries(bundle).map(([material, amount]) => (
            <div key={material} className="rounded-xl border-2 border-[#CC5500] bg-[#FFB066] p-2">
              <img src={materialArtFor(material)} alt={material} className="h-12 w-12 object-contain" />
              <b className="text-[#3B1F0E]">x{amount}</b>
            </div>
          ))}
        </div>
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button onClick={close} className="rounded-xl border-2 border-[#CC5500] px-3 py-3 font-bold text-[#3B1F0E] hover:bg-[#FFB066]">Cancel</button>
          <button
            disabled={dismantling}
            onClick={async () => {
              setDismantling(true);
              try {
                await confirm();
              } finally {
                setDismantling(false);
              }
            }}
            className="rounded-xl bg-[#CC5500] px-3 py-3 font-black text-white disabled:cursor-wait disabled:opacity-60"
          >
            {dismantling ? "Dismantling..." : "Dismantle"}
          </button>
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
    <div className="modal-layer fixed inset-0 z-[9999] flex min-h-screen items-center justify-center bg-black/80 px-5 backdrop-blur-sm">
      <div className="craft-machine-modal w-full max-w-xl rounded-3xl border-2 border-[#3c3a34] bg-[#13120F] p-6 text-center text-white shadow-2xl">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-[#e9bd67]">Crafting machine</p>
        <h2 className="mt-2 text-3xl font-black">{phase === "processing" ? "Forging your Bread" : phase === "charging" ? "Powering up" : "Craft complete!"}</h2>
          <div className="mt-6 rounded-2xl border-4 border-[#3c3a34] bg-[#27251F] p-5">
            <img src="/assets/crafting machine.svg" alt="Crafting machine" className="mx-auto mb-4 h-28 w-full object-contain" />
          <div className={`craft-reveal-stage flex min-h-44 items-center justify-center gap-2 overflow-hidden rounded-xl bg-[#13120F] p-4 ${phase === "charging" ? "craft-energy-charge" : phase === "output" ? "craft-output-flash" : ""}`}>
            {phase === "processing" ? (
              <div className="craft-material-stream flex items-center gap-2">
                {bundleEntries(ingredients).map(([material, amount]) => <span key={material} className="craft-input flex items-center rounded-xl bg-[#27251F] p-2"><img src={materialArtFor(material)} alt={material} className="h-12 w-12 object-contain" /><b className="text-sm">x{amount}</b></span>)}
              </div>
            ) : phase === "charging" ? (
              <div className="craft-energy-core"><span /><span /><span /></div>
            ) : (
              <div className="craft-output-pop relative rounded-2xl bg-[#27251F] p-5"><RewardBurst rarity={craftedRarityFor(name)} /><RewardArt name={name} art={artFor(name)} className="relative z-10 mx-auto h-36 w-36 object-contain" /><strong className="relative z-10 mt-2 block text-lg">{craftedRarityFor(name)}</strong></div>
            )}
          </div>
          <div className="mx-auto mt-4 flex max-w-sm items-center gap-2"><span className="h-3 flex-1 rounded-full bg-[#3c3a34]" /><span className="h-10 w-20 rounded-lg border-4 border-[#3c3a34] bg-[#5c574d]" /><span className="h-3 flex-1 rounded-full bg-[#3c3a34]" /></div>
        </div>
        {phase === "output" && <button onClick={close} className="craft-collect mt-6 w-full rounded-xl bg-[#e9bd67] px-4 py-3 font-black text-[#29170c]">Collect {name}</button>}
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

function ChatTab({ player, showBadge, giftNotice, clearGiftNotice, isGuest, onlinePlayers, openPlayerProfile, emojis, canManageEmojis, reloadEmojis, refreshPlayer, jumpTo = "", clearJump = () => undefined }: { jumpTo?: string; clearJump?: () => void; refreshPlayer: () => void | Promise<void>; emojis: { id: string; name: string; image: string }[]; canManageEmojis: boolean; reloadEmojis: () => void | Promise<void>; player: Player; showBadge: (badge: string) => void; giftNotice: string; clearGiftNotice: () => void; isGuest: boolean; onlinePlayers: { id: string; username: string; equippedBlook: string }[]; openPlayerProfile: (username: string) => void | Promise<void> }) {
  const [message, setMessage] = useState("");
  const [chatError, setChatError] = useState("");
  const [messages, setMessages] = useState<{ id?: string | number; user: string; text: string; badges?: string[]; equippedBlook?: string; isBreadletBot?: boolean; canDelete?: boolean; canMute?: boolean; evilAi?: boolean; profileId?: string; createdAt?: string; pending?: boolean; replyTo?: { id?: string | number; user: string; message: string } | null }[]>([
    { user: player.username, equippedBlook: player.equipped, badges: Array.from(new Set([...player.badges, ...tokenBadgesFor(player.tokens)])), text: "Welcome to Breadlet chat." },
  ]);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  // Messages that @mention this player get highlighted.
  const mentionPattern = useMemo(() => new RegExp(`(^|[^\\w@])@${player.username.replace(/[^a-zA-Z0-9_]/g, "")}\\b`, "i"), [player.username]);
  // Word game prizes are paid on the server; when the bot announces that this player won,
  // reload the balance so the Bread Bucks show up right away instead of after a refresh.
  // Messages already in chat when it opens are only marked as seen.
  const seenWinMessages = useRef<Set<string> | null>(null);
  useEffect(() => {
    const winText = `@${player.username.toLowerCase()} won`;
    const wins = messages.filter((item) => item.isBreadletBot && item.id != null && item.text.toLowerCase().includes(winText)).map((item) => String(item.id));
    if (!seenWinMessages.current) {
      if (messages.some((item) => item.id != null)) seenWinMessages.current = new Set(wins);
      return;
    }
    const fresh = wins.filter((id) => !seenWinMessages.current!.has(id));
    if (!fresh.length) return;
    fresh.forEach((id) => seenWinMessages.current!.add(id));
    void refreshPlayer();
  }, [messages, player.username, refreshPlayer]);
  const [replyTarget, setReplyTarget] = useState<{ id?: string | number; user: string; message: string } | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [onlinePanelOpen, setOnlinePanelOpen] = useState(false);
  const supabase = useMemo(() => isGuest ? null : createSupabaseClient(), [isGuest]);
  const isVerified = player.badges?.includes("Verified");
  // Who's typing: Realtime broadcast pings (no database writes). Each typer pings at most every
  // 2.5s; a name drops off 4s after their last ping, or right away when they send.
  const [typers, setTypers] = useState<Record<string, number>>({});
  const typingChannel = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(null);
  const lastTypingPing = useRef(0);
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase.channel("chat-typing", { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const name = String(payload?.username || "").slice(0, 20);
        if (!name || name === player.username) return;
        setTypers((current) => {
          const next = { ...current };
          if (payload?.stopped) delete next[name];
          else next[name] = Date.now() + 4000;
          return next;
        });
      })
      .subscribe();
    typingChannel.current = channel;
    const prune = window.setInterval(() => {
      setTypers((current) => {
        const now = Date.now();
        const live = Object.entries(current).filter(([, until]) => until > now);
        return live.length === Object.keys(current).length ? current : Object.fromEntries(live);
      });
    }, 1000);
    return () => {
      window.clearInterval(prune);
      typingChannel.current = null;
      void supabase.removeChannel(channel);
    };
  }, [supabase, player.username]);
  const announceTyping = (stopped = false) => {
    const now = Date.now();
    if (stopped ? !lastTypingPing.current : now - lastTypingPing.current < 2500) return;
    lastTypingPing.current = stopped ? 0 : now;
    void typingChannel.current?.send({ type: "broadcast", event: "typing", payload: { username: player.username, stopped } });
  };
  const typingNames = Object.keys(typers);
  const typingLabel = typingNames.length === 0 ? ""
    : typingNames.length > 5 ? "Several people are typing..."
    : `${typingNames.join(", ")} ${typingNames.length === 1 ? "is" : "are"} typing...`;

  const playerRef = useRef(player);
  playerRef.current = player;
  const loadMessages = useCallback(async () => {
    const player = playerRef.current;
    try {
      const response = await fetch("/api/chat", { cache: "no-store" });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
          setChatError(err.error || "Chat could not load. Check your connection and Supabase setup.");
        return;
      }
      setChatError("");
      const rows = await response.json();
      if (Array.isArray(rows)) {
        if (rows.length === 0) {
          setMessages([
            { user: player.username, equippedBlook: player.equipped, badges: Array.from(new Set([...player.badges, ...tokenBadgesFor(player.tokens)])), text: "Welcome to Breadlet chat." },
          ]);
        } else {
          setMessages((previous) => [
            ...rows.map((row: any) => {
              const username = row.user || (Array.isArray(row.profiles) ? row.profiles[0]?.username : row.profiles?.username) || "Player";
              return {
                id: row.id,
                user: username,
                text: row.message,
                equippedBlook: row.equippedBlook || "",
                isBreadletBot: row.isBreadletBot === true,
                canDelete: row.canDelete === true,
                canMute: row.canMute === true,
                evilAi: row.evilAi === true,
                profileId: row.profile_id,
                createdAt: row.created_at,
                replyTo: row.replyTo || null,
                badges: row.badges || (username === player.username ? Array.from(new Set([...player.badges, ...tokenBadgesFor(player.tokens)])) : []),
              };
            }),
            ...previous.filter((item) => item.pending),
          ]);
        }
      }
    } catch (err) {
      console.error('[CLIENT_CHAT] Error in loadMessages:', err);
    }
  }, []);

  useEffect(() => {
    loadMessages();
    if (!supabase) {
      return;
    }
    let refreshTimer: number | undefined;
    const channel = supabase
      .channel("global-chat")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "global_chat_messages" },
        (payload) => {
          const row = payload.new as { id: string; message: string; profile_id: string; created_at: string; reply_to_message_id: string | null; is_breadlet_bot?: boolean };
          const me = playerRef.current;
          // Decide from a snapshot: React may run the state updater below later, not right away.
          const senderKnown = row?.is_breadlet_bot === true || row?.profile_id === me.id || messagesRef.current.some((item) => item.profileId === row?.profile_id && !item.isBreadletBot);
          setMessages((current) => {
            if (!row?.id || current.some((item) => item.id === row.id)) return current;
            const isBot = row.is_breadlet_bot === true;
            const mine = !isBot && row.profile_id === me.id;
            // Reuse what we already know about the sender; unknown senders wait for the reload below.
            const known = isBot || mine ? null : [...current].reverse().find((item) => item.profileId === row.profile_id && !item.isBreadletBot);
            if (!isBot && !mine && !known) return current;
            const target = row.reply_to_message_id ? current.find((item) => String(item.id) === String(row.reply_to_message_id)) : null;
            const next = {
              id: row.id,
              user: isBot ? "Breadlet" : mine ? me.username : known!.user,
              text: row.message,
              equippedBlook: isBot ? "" : mine ? me.equipped : known!.equippedBlook,
              isBreadletBot: isBot,
              profileId: row.profile_id,
              createdAt: row.created_at,
              canDelete: mine,
              badges: isBot ? [] : mine ? Array.from(new Set([...me.badges, ...tokenBadgesFor(me.tokens)])) : known!.badges,
              replyTo: target ? { id: target.id, user: target.user, message: target.text } : null,
            };
            // Our own message: swap the "sending" copy for the real one.
            const pendingIndex = mine ? current.findIndex((item) => item.pending && item.text === row.message) : -1;
            if (pendingIndex >= 0) return current.map((item, index) => (index === pendingIndex ? { ...item, ...next, replyTo: item.replyTo, pending: false } : item));
            return [...current, next].slice(-60);
          });
          // A quiet full reload afterwards fills in profiles, badges and moderator buttons.
          if (refreshTimer) window.clearTimeout(refreshTimer);
          refreshTimer = window.setTimeout(loadMessages, senderKnown ? 2500 : 150);
        }
      )
      .subscribe((status) => {
      });

    return () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [loadMessages, supabase]);

  const sendMessageText = async (textToSend: string, reply = replyTarget) => {
    if (!textToSend.trim()) return;
    if (textToSend.trim().startsWith("/")) window.dispatchEvent(new Event(GAMES_CHANGED_EVENT));
    if (supabase) {
      const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const dropPending = () => setMessages((current) => current.filter((item) => item.id !== tempId));
      setMessages((current) => [...current, { id: tempId, user: player.username, text: textToSend, equippedBlook: player.equipped, isBreadletBot: false, profileId: player.id, createdAt: new Date().toISOString(), replyTo: reply || null, badges: Array.from(new Set([...player.badges, ...tokenBadgesFor(player.tokens)])), pending: true }]);
      setReplyTarget(null);
      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: textToSend, replyToMessageId: reply?.id == null ? null : String(reply.id) }),
        });
        if (response.ok) {
          const data = await response.json();
          setChatError("");
          setMessages((current) => {
            // Realtime may have delivered the real message already.
            if (data.id && current.some((item) => item.id === data.id)) return current.filter((item) => item.id !== tempId);
            return current.map((item) => (item.id === tempId ? { ...item, id: data.id ?? tempId, text: data.message || textToSend, createdAt: data.created_at || item.createdAt, replyTo: data.replyTo || item.replyTo, canDelete: true, pending: false } : item));
          });
        } else {
          dropPending();
          const result = await response.json().catch(() => ({}));
          setChatError(result.error || "Your message could not be sent.");
        }
      } catch (err) {
        dropPending();
        console.error('[CLIENT_CHAT] Error sending message:', err);
        setChatError("Could not reach chat. Check your connection and try again.");
      }
    } else {
      setMessages((current) => [...current, { id: `local-${Date.now()}`, user: player.username, equippedBlook: player.equipped, replyTo: reply || null, badges: Array.from(new Set([...player.badges, ...tokenBadgesFor(player.tokens)])), text: textToSend }]);
      setReplyTarget(null);
    }
  };

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = message.trim();
    if (!text) return;
    setMessage("");
    announceTyping(true);
    if (text.toLowerCase() === "/accept" && supabase) {
      const result = await postGameAction({ action: "coinflip_accept" });
      setChatError(result.ok ? "" : result.error || "Could not join the coin flip.");
      return;
    }
    if (text.toLowerCase() === "/cancel" && supabase) {
      const result = await postGameAction({ action: "cancel" });
      setChatError(result.ok ? "" : result.error || "Could not cancel the game.");
      return;
    }
    await sendMessageText(text);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 400 * 1024) {
      alert("Image file size must be smaller than 400KB.");
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

  const renderMessageContent = (text: string, isBreadletBot = false) => {
    if (text.startsWith("[img]") && text.endsWith("[/img]")) {
      const src = text.slice(5, -6);
      return (
        <img
          src={src}
          alt="Chat attachment"
          className="mt-2 max-h-72 max-w-sm rounded-xl border border-[#3d91cd] object-contain bg-[#103f75] p-1 shadow-md"
        />
      );
    }
    return <p className={isBreadletBot ? "chat-breadlet-fact chat-message-text" : "chat-message-text text-[#d7b88c] whitespace-pre-wrap break-words"}>{renderEmojiText(text, [...emojis, ...blookEmojis()])}</p>;
  };

  const muteChatter = async (targetId: string, name: string) => {
    if (!window.confirm(`Time out ${name} from chat for 30 minutes?`)) return;
    const response = await fetch("/api/chat/mute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetId }) }).catch(() => null);
    const result = await response?.json().catch(() => ({}));
    setChatError(response?.ok ? "" : result?.error || "Could not time out that player.");
    if (response?.ok && typeof result?.mutesLeft === "number") window.alert(`${name} is timed out for 30 minutes. You have ${result.mutesLeft} timeout${result.mutesLeft === 1 ? "" : "s"} left today.`);
  };

  // Admin only: turns a player's 30-minute evil AI mode on or off (works on yourself too).
  const toggleEvilAi = async (targetId: string, name: string) => {
    const response = await fetch("/api/chat/evil", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "player", targetId }) }).catch(() => null);
    const result = await response?.json().catch(() => ({}));
    if (!response?.ok) return setChatError(result?.error || "Could not change evil AI mode.");
    setChatError("");
    setMessages((current) => current.map((item) => (item.profileId === targetId ? { ...item, evilAi: result.active } : item)));
    window.alert(result.active ? `😈 Evil AI mode is on for ${name} for 30 minutes.` : `😇 Evil AI mode is off for ${name}.`);
  };

  const giveWalterWhite = async (targetId: string, name: string) => {
    const response = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetId, operation: "add", blookName: "Walter White", notification: { title: "You got Walter White!", message: "An admin gave you the Walter White Breadlet. Check your Breadlets." } }),
    }).catch(() => null);
    const result = await response?.json().catch(() => ({}));
    window.alert(response?.ok ? `Gave Walter White to ${name}.` : result?.error || "Could not give Walter White.");
  };

  const chatListRef = useRef<HTMLDivElement>(null);
  const chatScrolledRef = useRef(false);
  const [chatAtBottom, setChatAtBottom] = useState(true);
  const lastSeenKey = `breadlet-chat-last-seen-${player.username}`;
  const [lastSeenAtOpen] = useState(() => (typeof window === "undefined" ? "" : window.localStorage.getItem(lastSeenKey) || ""));
  const newestCreatedAt = messages.reduce((latest, item) => (item.createdAt && item.createdAt > latest ? item.createdAt : latest), "");
  const firstUnreadId = lastSeenAtOpen
    ? messages.find((item) => item.createdAt && item.createdAt > lastSeenAtOpen && item.user !== player.username)?.id
    : undefined;
  useEffect(() => {
    const list = chatListRef.current;
    if (!list || !messages.length) return;
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 160;
    if (!chatScrolledRef.current || nearBottom) {
      list.scrollTop = list.scrollHeight;
      chatScrolledRef.current = true;
      setChatAtBottom(true);
      if (newestCreatedAt) window.localStorage.setItem(lastSeenKey, newestCreatedAt);
    } else {
      setChatAtBottom(false);
    }
  }, [messages, newestCreatedAt, lastSeenKey]);
  const handleChatScroll = () => {
    const list = chatListRef.current;
    if (!list) return;
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    setChatAtBottom(atBottom);
    if (atBottom && newestCreatedAt) window.localStorage.setItem(lastSeenKey, newestCreatedAt);
  };
  const scrollChatToBottom = () => chatListRef.current?.scrollTo({ top: chatListRef.current.scrollHeight, behavior: "smooth" });
  // Jump to a message (an @mention), flashing it. Chat keeps only recent messages, so it may be gone.
  const jumpToMessage = useCallback((id: string) => {
    const element = document.getElementById(`chat-message-${id}`);
    if (!element) return false;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.classList.remove("chat-flash");
    void element.offsetWidth;
    element.classList.add("chat-flash");
    return true;
  }, []);
  useEffect(() => {
    if (!jumpTo || !messages.length) return;
    // Wait a beat so the list has rendered and scrolled to the bottom first.
    const timer = window.setTimeout(() => {
      if (!jumpToMessage(jumpTo)) setChatError("That message is no longer in chat.");
      clearJump();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [jumpTo, messages.length, jumpToMessage, clearJump]);
  const lastMentionId = [...messages].reverse().find((item) => !item.isBreadletBot && item.user !== player.username && mentionPattern.test(item.text || ""))?.id;

  const messageGroups = messages.reduce<Array<{ user: string; isBreadletBot: boolean; items: Array<{ item: (typeof messages)[number]; index: number }> }>>((groups, item, index) => {
    const current = groups[groups.length - 1];
    if (current && current.user === item.user && current.isBreadletBot === Boolean(item.isBreadletBot)) {
      current.items.push({ item, index });
    } else {
      groups.push({ user: item.user, isBreadletBot: Boolean(item.isBreadletBot), items: [{ item, index }] });
    }
    return groups;
  }, []);
  const deleteMessage = async (item: (typeof messages)[number], index: number) => {
    if (item.id == null || String(item.id).startsWith("local-")) {
      setMessages((current) => current.filter((_, messageIndex) => messageIndex !== index));
      return;
    }
    try {
      const response = await fetch(`/api/chat?id=${encodeURIComponent(String(item.id))}`, { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setChatError(result.error || "Your message could not be deleted.");
        return;
      }
      setMessages((current) => current.filter((messageItem) => messageItem.id !== item.id));
      setChatError("");
    } catch (error) {
      console.error("[CLIENT_CHAT] Error deleting message:", error);
      setChatError("Could not reach chat. Check your connection and try again.");
    }
  };
  const saveEditedMessage = async (item: (typeof messages)[number], index: number) => {
    const updatedMessage = editDraft.trim();
    if (!updatedMessage) {
      setChatError("Message cannot be empty.");
      return;
    }

    if (item.id == null || String(item.id).startsWith("local-")) {
      setMessages((current) => current.map((messageItem, messageIndex) =>
        messageIndex === index ? { ...messageItem, text: updatedMessage } : messageItem,
      ));
      setEditingMessageId(null);
      setEditDraft("");
      setChatError("");
      return;
    }

    try {
      const response = await fetch("/api/chat", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, message: updatedMessage }),
      });
      const result = await response.json();
      if (!response.ok) {
        setChatError(result.error || "Your message could not be edited.");
        return;
      }
      setMessages((current) => current.map((messageItem) =>
        messageItem.id === result.id ? { ...messageItem, text: result.message } : messageItem,
      ));
      setEditingMessageId(null);
      setEditDraft("");
      setChatError("");
    } catch (error) {
      console.error("[CLIENT_CHAT] Error editing message:", error);
      setChatError("Could not reach chat. Check your connection and try again.");
    }
  };

  return (
    <div className="global-chat flex h-full min-h-0 w-full flex-col">
      <h1 className="sr-only">Global Chat</h1>
      {chatError && <p role="alert" className="mb-3 rounded-lg border border-orange-300/40 bg-black/20 px-3 py-2 text-sm text-orange-100">{chatError}</p>}
      {giftNotice && (
        <div className="modal-layer fixed inset-0 z-[9999] flex min-h-screen items-center justify-center bg-black/55 px-5 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-[#73c8ff] bg-[#18558f] p-6 text-center shadow-2xl">
            <p className="text-lg font-black text-[#bde8ff]">Gift notification</p>
            <p className="mt-3 text-sm text-[#d9f3ff]">{giftNotice}</p>
            <button onClick={clearGiftNotice} className="mt-5 w-full rounded-xl bg-[#39a8f5] px-4 py-3 font-black text-[#031426]">Close</button>
          </div>
        </div>
      )}
      <div ref={chatListRef} onScroll={handleChatScroll} className="chat-message-list min-h-0 flex-1 overflow-y-auto py-4">
        {messageGroups.map((group) => {
          const latest = group.items[group.items.length - 1];
          const latestItem = latest.item;
          return (
            <div key={`${group.user}-${latest.index}`} className="chat-group">
              <button disabled={group.isBreadletBot} onClick={() => !group.isBreadletBot && void openPlayerProfile(group.user)} aria-label={group.isBreadletBot ? "Breadlet chat bot" : `Open ${group.user}'s profile`} title={group.isBreadletBot ? "Breadlet" : `View ${group.user}'s profile`} className="chat-avatar disabled:cursor-default">
                {group.isBreadletBot ? <img src="/assets/breadlet-logo.svg" alt="Breadlet logo" className="h-full w-full object-contain" /> : latestItem.equippedBlook || (group.user === player.username && player.equipped) ? <BlookImg name={latestItem.equippedBlook || player.equipped} className="h-full w-full" /> : <img src="/assets/breadlet-logo.svg" alt="" className="h-full w-full object-contain" />}
              </button>
              <div className="min-w-0 flex-1">
                <div className="chat-group-header">
                  <button disabled={group.isBreadletBot} onClick={() => !group.isBreadletBot && void openPlayerProfile(group.user)} className="chat-username hover:underline disabled:cursor-default disabled:no-underline">{group.user}{group.isBreadletBot ? " 🤖" : ""}</button>
                  {(group.user === player.username ? Array.from(new Set([...player.badges, ...tokenBadgesFor(player.tokens)])) : latestItem.badges || []).map((badge) => (
                    <button key={badge} onClick={() => showBadge(badge)} title={badge} className="chat-badge">
                      <img src={badgeIconFor(badge)} alt={badge} className="h-full w-full object-contain" />
                    </button>
                  ))}
                  {group.items[0].item.createdAt && <time className="chat-time" dateTime={group.items[0].item.createdAt}>{new Date(group.items[0].item.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>}
                  {latestItem.evilAi && <span title="Evil AI mode: Breadlet is rude to this player" className="text-sm" aria-label="Evil AI mode">😈</span>}
                  {latestItem.canMute && latestItem.profileId && (
                    <button type="button" onClick={() => void muteChatter(latestItem.profileId!, group.user)} className="rounded-md border-2 border-[#CC5500] bg-[#FFD9B3] px-2 py-0.5 text-[10px] font-black text-[#3B1F0E] hover:bg-white">Timeout 30m</button>
                  )}
                  {canManageEmojis && !isGuest && !group.isBreadletBot && latestItem.profileId && (
                    <button type="button" onClick={() => void toggleEvilAi(latestItem.profileId!, group.user)} className="rounded-md border-2 border-[#7a1f1f] bg-[#3a1512] px-2 py-0.5 text-[10px] font-black text-[#fca5a5] hover:bg-[#5a1f1a]">{latestItem.evilAi ? "😇 Stop evil AI" : "😈 Evil AI"}</button>
                  )}
                  {canManageEmojis && !isGuest && !group.isBreadletBot && latestItem.profileId && latestItem.user !== player.username && (
                    <button type="button" onClick={() => void giveWalterWhite(latestItem.profileId!, group.user)} className="rounded-md border-2 border-[#CC5500] bg-[#FFD9B3] px-2 py-0.5 text-[10px] font-black text-[#3B1F0E] hover:bg-white">Give Walter White</button>
                  )}
                </div>
                <div className="mt-1">
                  {group.items.map(({ item, index }) => {
                    const messageId = String(item.id ?? `local-${item.user}-${index}`);
                    const canEdit = !item.isBreadletBot && item.user === player.username && (item.id != null || isGuest);
                    return (
                      <div key={messageId} id={`chat-message-${messageId}`} className={`chat-group-message${item.pending ? " chat-pending" : ""}${!item.isBreadletBot && item.user !== player.username && mentionPattern.test(item.text) ? " chat-mention" : ""}`}>
                        {firstUnreadId != null && item.id === firstUnreadId && (
                          <div className="chat-new-divider" role="separator"><span /><b>NEW MESSAGES</b></div>
                        )}
                        {item.replyTo && (
                          <button type="button" onClick={() => item.replyTo?.id != null && document.getElementById(`chat-message-${String(item.replyTo.id)}`)?.scrollIntoView({ behavior: "smooth", block: "center" })} className="chat-reply-preview">
                            <Reply size={14} aria-hidden="true" /><b>@{item.replyTo.user}</b><span>{item.replyTo.message.startsWith("[img]") ? "📷 Image" : item.replyTo.message}</span>
                          </button>
                        )}
                        {editingMessageId === messageId ? (
                          <div className="space-y-2">
                            <textarea value={editDraft} onChange={(event) => setEditDraft(event.target.value)} maxLength={500} aria-label="Edit message" className="w-full resize-y rounded-lg border border-[#5c574d] bg-[#13120F] p-2 text-sm text-white outline-none focus:border-[#e9bd67]" />
                            <div className="flex gap-2">
                              <button type="button" onClick={() => void saveEditedMessage(item, index)} className="rounded-lg bg-[#e9bd67] px-3 py-1.5 text-xs font-black text-[#29170c]">Save</button>
                              <button type="button" onClick={() => { setEditingMessageId(null); setEditDraft(""); }} className="rounded-lg border border-[#5c574d] px-3 py-1.5 text-xs font-bold">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div className="chat-message-content-row">
                            {renderMessageContent(item.text, item.isBreadletBot)}
                            {(item.id != null || isGuest) && (
                              <button type="button" onClick={() => setReplyTarget({ id: item.id ?? `local-${item.user}-${index}`, user: item.user, message: item.text })} aria-label="Reply" title="Reply" className="chat-message-icon-button">
                                <Reply size={16} />
                              </button>
                            )}
                            {(item.canDelete || (isGuest && !item.isBreadletBot && item.user === player.username)) && (
                              <button type="button" onClick={() => void deleteMessage(item, index)} aria-label="Delete message" title="Delete message" className="chat-message-icon-button">
                                <Trash2 size={14} />
                              </button>
                            )}
                            {canEdit && (
                              <button type="button" onClick={() => { setEditingMessageId(messageId); setEditDraft(item.text); }} aria-label="Edit message" title="Edit message" className="chat-message-icon-button">
                                <Pencil size={14} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="relative z-10 h-0 shrink-0">
        {!chatAtBottom && <button type="button" onClick={scrollChatToBottom} className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border-2 border-[#CC5500] bg-[#3B1F0E] px-4 py-2 text-sm font-black text-white shadow-lg hover:bg-[#5a2f16]">Scroll to most recent message ↓</button>}
        {lastMentionId != null && <button type="button" onClick={() => jumpToMessage(String(lastMentionId))} className="chat-mention-jump" title="Jump to the last message that mentioned you">@ Jump to my mention</button>}
      </div>
      <p className="chat-typing" aria-live="polite">{typingLabel && <><span className="chat-typing-dots" aria-hidden="true"><i /><i /><i /></span>{typingLabel}</>}</p>
      <div className="chat-input-row mt-1 flex shrink-0 items-center gap-3">
      <form onSubmit={send} className="flex min-w-0 flex-1 items-center gap-3">
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
        <EmojiPicker emojis={emojis} canManage={canManageEmojis} onPick={(text) => setMessage((current) => `${current}${text}`.slice(0, 500))} onChanged={reloadEmojis} />
        <div className="min-w-0 flex-1">
        {replyTarget && <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border-l-2 border-sky-300 bg-sky-300/10 px-3 py-2 text-xs text-sky-100"><span className="min-w-0 truncate">Replying to <b>{replyTarget.user}</b>: {replyTarget.message}</span><button type="button" aria-label="Cancel reply" onClick={() => setReplyTarget(null)} className="shrink-0 px-2 text-base">×</button></div>}
        <input
          value={message}
          onChange={(event) => { setMessage(event.target.value); announceTyping(!event.target.value.trim()); }}
          onBlur={() => announceTyping(true)}
          placeholder={isVerified ? "Write a message or upload an image..." : "Write a message..."}
          className="w-full rounded-xl bg-[#24170f] px-4 py-3 text-white outline-none focus:border-[#3d91cd]"
        />
        </div>
        <button type="submit" className="rounded-xl bg-[#e9bd67] px-5 py-3 font-black text-[#29170c]">
          Send
        </button>
      </form>
      <aside aria-label="Online players" className={`chat-side-actions relative flex shrink-0 items-center gap-2 ${onlinePanelOpen ? "chat-online-panel-open" : ""}`}>
        {!isGuest && <GamesMenu onError={setChatError} onAsk={(question) => sendMessageText(`/ai ${question}`, null)} />}
        {onlinePanelOpen && <div className="chat-online-list absolute bottom-full right-0 z-50 mb-2 max-h-[38vh] w-[min(18rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl border border-sky-300/40 bg-[#0c2947]/95 p-2 text-white shadow-2xl backdrop-blur-md"><header className="flex items-center justify-between border-b border-sky-200/20 px-3 py-2"><div><h2 className="font-black">Online Players</h2><p className="text-xs text-sky-100/70">{onlinePlayers.length} online now</p></div><span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_12px_#34d399]" /></header>{onlinePlayers.map((online) => <button key={online.id} onClick={() => void openPlayerProfile(online.username)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/10"><span className="grid h-10 w-10 shrink-0 place-items-center">{online.equippedBlook ? <RewardArt name={online.equippedBlook} art={artFor(online.equippedBlook)} className="h-8 w-8" /> : <img src="/assets/breadlet-logo.svg" alt="" className="h-8 w-8 object-contain" />}</span><span className="min-w-0 flex-1 truncate text-sm font-bold">{online.username}</span><span className="h-2 w-2 rounded-full bg-emerald-400" /></button>)}{!onlinePlayers.length && <p className="px-3 py-5 text-center text-sm text-white/60">{isGuest ? "Sign in to see live players." : "No players detected yet."}</p>}</div>}
        <button type="button" aria-expanded={onlinePanelOpen} onClick={() => setOnlinePanelOpen((open) => !open)} className="chat-online-toggle flex items-center gap-2 rounded-xl border border-sky-300/45 bg-[#0c2947]/95 px-4 py-3 text-white hover:bg-[#103f75]"><CircleUserRound size={20} fill="currentColor" strokeWidth={1.5} /><span className="text-xl font-black">{onlinePlayers.length} online</span></button>
      </aside>
      </div>
    </div>
  );
}

type LeaderboardEntry = { key: string; rank: number; name: string; value: number; art: string; blook?: string; badges: string[]; own: boolean; sub?: string; profileName?: string };
function LeaderboardTab({ player, showBadge, openPlayerProfile }: { player: Player; showBadge: (badge: string) => void; openPlayerProfile: (username: string) => void | Promise<void> }) {
  const [board, setBoard] = useState<"players" | "clans">("players");
  const [playerRows, setPlayerRows] = useState<{ rank: number; id: string; username: string; tokens: number; equippedBlook: string; badges: string[] }[]>([]);
  const [clanRows, setClanRows] = useState<{ id: string; name: string; treasury: number; members: number; profileBlook: string; thumbnailUrl: string }[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [response, clanResponse] = await Promise.all([fetch("/api/rankings", { cache: "no-store" }), fetch("/api/clans?summary=1", { cache: "no-store" }).catch(() => null)]);
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data)) {
        setError((data && data.error) || "The leaderboard could not load.");
        setStatus("error");
        return;
      }
      setPlayerRows(data);
      const clanData = clanResponse?.ok ? await clanResponse.json().catch(() => null) : null;
      if (clanData && Array.isArray(clanData.clans)) {
        setClanRows(clanData.clans.map((clan: Record<string, unknown>) => ({
          id: String(clan.id),
          name: String(clan.name || "Clan"),
          treasury: Number(clan.treasury) || 0,
          members: Number(clan.member_count) || 1,
          profileBlook: typeof clan.profile_blook === "string" ? clan.profile_blook : "",
          thumbnailUrl: typeof clan.thumbnail_url === "string" ? clan.thumbnail_url : "",
        })).sort((a: { treasury: number }, b: { treasury: number }) => b.treasury - a.treasury).slice(0, 50));
      }
      setStatus("ready");
    } catch {
      setError("Could not reach the leaderboard. Check your connection.");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 120000);
    return () => window.clearInterval(timer);
  }, [load]);

  const entries: LeaderboardEntry[] = board === "players"
    ? playerRows.map((row) => ({ key: row.id, rank: row.rank, name: row.username, value: row.tokens, art: "", blook: row.equippedBlook, badges: row.badges, own: row.id === player.id, profileName: row.username }))
    : clanRows.map((row, index) => ({ key: row.id, rank: index + 1, name: row.name, value: row.treasury, art: row.profileBlook ? "" : row.thumbnailUrl, blook: row.profileBlook, badges: [], own: false, sub: `${row.members} members` }));
  const podium = [entries[1], entries[0], entries[2]].filter(Boolean) as LeaderboardEntry[];
  const rest = entries.slice(3);
  const ordinal = (rank: number) => (rank === 1 ? "1st" : rank === 2 ? "2nd" : "3rd");
  const openEntry = (entry: LeaderboardEntry) => { if (entry.profileName) void openPlayerProfile(entry.profileName); };
  const valueLabel = board === "players" ? "tokens" : "treasury";

  return (
    <div className="leaderboard-page mx-auto w-full max-w-5xl">
      <div className="flex items-center justify-between gap-4">
        <h1 className="page-sign text-5xl font-black text-white">Leaderboard</h1>
        <button onClick={() => void load()} className="rounded-xl border-2 border-[#CC5500] bg-[#27251F] px-4 py-2 text-sm font-black text-white hover:bg-[#13120F]">Refresh</button>
      </div>
      <div className="leaderboard-tabs mt-4 flex gap-3">
        {(["players", "clans"] as const).map((item) => (
          <button key={item} type="button" aria-pressed={board === item} onClick={() => setBoard(item)} className="leaderboard-tab rounded-full border-2 px-5 py-2 text-sm font-black">{item === "players" ? "Most Bread Bucks" : "Top Clans"}</button>
        ))}
      </div>
      {status === "error" && <p role="alert" className="mt-4 rounded-lg border border-[#CC5500] bg-[#27251F] px-3 py-2 text-sm text-white">{error}</p>}
      {status === "loading" && <p className="mt-6 font-bold">Loading rankings...</p>}
      {status === "ready" && !entries.length && <p className="mt-6 font-bold">Nobody is ranked yet.</p>}
      {podium.length > 0 && (
        <div className="leaderboard-podium mt-8 flex items-end justify-center gap-4">
          {podium.map((entry) => (
            <div key={entry.key} className={`leaderboard-podium-card flex flex-col items-center rounded-2xl border-2 p-5 text-center ${entry.rank === 1 ? "leaderboard-first" : ""}`}>
              <p className="text-lg font-black">{ordinal(entry.rank)}</p>
              <button type="button" disabled={!entry.profileName} onClick={() => openEntry(entry)} className="mt-2 max-w-full truncate text-2xl font-black disabled:cursor-default">{entry.name}</button>
              <div className="my-4 grid h-28 w-28 place-items-center">{entry.blook ? <BlookImg name={entry.blook} className="h-full w-full" /> : entry.art ? <img src={entry.art} alt="" className="h-full w-full object-contain" /> : <img src="/assets/breadlet-logo.svg" alt="" className="h-full w-full object-contain" />}</div>
              <p className="flex items-center gap-2 text-xl font-black"><img src="/assets/Bread%20bucks.svg" alt="" className="h-6 w-6" />{entry.value.toLocaleString()}</p>
              {entry.sub && <p className="text-xs font-bold opacity-80">{entry.sub}</p>}
            </div>
          ))}
        </div>
      )}
      <ol className="mt-6 space-y-3">
        {rest.map((entry) => (
          <li key={entry.key} className={`leaderboard-row flex items-center gap-4 rounded-2xl border-2 px-4 py-2 ${entry.own ? "leaderboard-row-own" : ""}`}>
            <span className="w-10 shrink-0 text-center text-lg font-black">{entry.rank}</span>
            <span className="grid h-12 w-12 shrink-0 place-items-center">{entry.blook ? <BlookImg name={entry.blook} className="h-full w-full" /> : entry.art ? <img src={entry.art} alt="" className="h-full w-full object-contain" /> : <img src="/assets/breadlet-logo.svg" alt="" className="h-full w-full object-contain" />}</span>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <button type="button" disabled={!entry.profileName} onClick={() => openEntry(entry)} className="truncate text-lg font-black hover:underline disabled:cursor-default disabled:no-underline">{entry.name}{entry.own ? " (you)" : ""}</button>
              {entry.sub && <span className="text-xs font-bold opacity-80">{entry.sub}</span>}
              {entry.badges.map((badge) => <button key={badge} type="button" onClick={() => showBadge(badge)} title={badge} className="h-5 w-5"><img src={badgeIconFor(badge)} alt={badge} className="h-5 w-5 object-contain" /></button>)}
            </div>
            <span className="flex shrink-0 items-center gap-1.5 text-lg font-black" title={valueLabel}><img src="/assets/Bread%20bucks.svg" alt="" className="h-5 w-5" />{entry.value.toLocaleString()}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}function BadgeModal({ badge, close }: { badge: string; close: () => void }) {
  return (
    <div className="modal-layer fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 px-5 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl border border-[#3d91cd] bg-[#103f75] p-6 text-center shadow-2xl">
        <img
          src={badgeIconFor(badge)}
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
      <h1 className="page-sign mt-2 text-4xl font-black">Promo Codes</h1>
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
function ResourcesTab({ open }: { open: (tab: "promo" | "bank" | "referrals") => void }) {
  const resources = [
    { title: "Promo Codes", description: "Redeem a Breadlet code for its reward.", icon: <Percent size={22} />, tab: "promo" as const },
    { title: "Refer a Friend", description: "Share your code and earn 500 Bread Bucks per signup.", icon: <Gift size={22} />, tab: "referrals" as const },
  { title: "Bread Bucks Bank", description: "See a running total of your Bread Bucks spending.", icon: <img src="/assets/piggy bank.svg" alt="" className="h-7 w-7 object-contain" />, tab: "bank" as const },
  ];
  return (
    <div className="resources-workspace mx-auto w-full max-w-5xl">
      <header className="mb-7">
        <p className="resources-eyebrow text-xs font-black uppercase tracking-[0.25em]">Breadlet library</p>
        <h1 className="page-sign mt-2 text-4xl font-black">Resources</h1>
        <p className="resources-description mt-3 max-w-2xl leading-7">Guides, account tools, and the artwork behind Breadlet, all in one place.</p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        {resources.map((resource) => (
          <button key={resource.title} type="button" onClick={() => open(resource.tab)} className="resource-card group flex min-h-36 items-start gap-4 rounded-2xl border p-5 text-left shadow-lg shadow-[#031426]/10">
            <span className="resource-icon grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-white/10">{resource.icon}</span>
            <span className="min-w-0 flex-1">
              <strong className="resource-title block text-lg font-black">{resource.title}</strong>
              <span className="resource-description mt-1 block text-sm leading-6">{resource.description}</span>
              <span className="resource-open mt-4 inline-flex items-center gap-1 text-xs font-black uppercase tracking-wider">Open <span aria-hidden="true">→</span></span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

const referralRewards = [
  { at: 1, label: "Every signup with your code", reward: "500 Bread Bucks each" },
  { at: 25, label: "25 referrals", reward: "Verified badge" },
  { at: 50, label: "50 referrals (max)", reward: "Your own custom code" },
];

function ReferralsTab({ isGuest }: { isGuest: boolean }) {
  const [info, setInfo] = useState<{ code: string; count: number } | null>(null);
  const [error, setError] = useState("");
  const [custom, setCustom] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isGuest) return;
    fetch("/api/referrals", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Referrals could not load.");
        setInfo(result);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Referrals could not load."));
  }, [isGuest]);

  const count = info?.count || 0;
  const saveCustom = async () => {
    setMessage("");
    const response = await fetch("/api/referrals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customCode: custom }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setMessage(result.error || "Could not save your code."); return; }
    setInfo(result);
    setCustom("");
    setMessage("Custom code saved!");
  };

  return (
    <div className="resources-workspace mx-auto w-full max-w-3xl">
      <p className="resources-eyebrow text-xs font-black uppercase tracking-[0.25em]">Resources / Refer a Friend</p>
      <h1 className="page-sign mt-2 text-4xl font-black">Refer a Friend</h1>
      <section className="bank-card mt-6 rounded-3xl border p-6 text-center sm:p-9">
        <p className="text-xs font-black uppercase tracking-[0.2em]">Your referral code</p>
        <p className="mt-2 text-4xl font-black tracking-widest">{isGuest ? "Sign in" : info?.code || "…"}</p>
        {info && <button type="button" className="mt-3 rounded-xl bg-[#E77D22] px-5 py-2 font-black text-white" onClick={() => { void navigator.clipboard?.writeText(info.code); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied!" : "Copy code"}</button>}
        <p className="mt-4 text-sm font-bold">{count} / 50 players invited</p>
        <div className="mx-auto mt-2 h-3 w-full max-w-sm overflow-hidden rounded-full bg-black/40"><div className="h-full bg-[#E77D22]" style={{ width: `${Math.min(100, count * 2)}%` }} /></div>
        <p className="bank-note mt-3 text-xs leading-5">New players type your code when they sign up. You get 500 Bread Bucks for each one, up to 50.</p>
        {error && <p className="mt-2 text-sm font-bold text-[#ff5a4d]">{error}</p>}
      </section>
      <section className="bank-card mt-4 rounded-3xl border p-6">
        <h2 className="text-lg font-black">Rewards</h2>
        <div className="mt-3 space-y-2">
          {referralRewards.map((entry) => (
            <div key={entry.at} className={`flex items-center justify-between rounded-xl border p-3 ${count >= entry.at ? "opacity-100" : "opacity-60"}`}>
              <span className="font-bold">{entry.label}</span>
              <span className="font-black">{count >= entry.at ? "✓ " : ""}{entry.reward}</span>
            </div>
          ))}
        </div>
        {count >= 50 && (
          <div className="mt-4 flex gap-2">
            <input value={custom} maxLength={16} onChange={(event) => setCustom(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder="Custom code (4-16 letters/numbers)" className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-white" />
            <button type="button" onClick={() => void saveCustom()} className="rounded-xl bg-[#E77D22] px-4 py-2 font-black text-white">Save</button>
          </div>
        )}
        {message && <p className="mt-2 text-sm font-bold">{message}</p>}
      </section>
    </div>
  );
}
function TokenBankTab({ isGuest }: { isGuest: boolean }) {
  const [bank, setBank] = useState<{ historicalEstimate: number; trackedSpent: number; totalSpent: number; bankBalance?: number } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!isGuest);

  useEffect(() => {
    if (isGuest) return;
    const controller = new AbortController();
    fetch("/api/token-bank", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Token Bank could not load.");
        setBank(result);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Token Bank could not load.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [isGuest]);

  return (
    <div className="resources-workspace mx-auto w-full max-w-3xl">
      <p className="resources-eyebrow text-xs font-black uppercase tracking-[0.25em]">Resources / Token Bank</p>
      <h1 className="page-sign mt-2 text-4xl font-black">Token Bank</h1>
      <section className="bank-card mt-6 overflow-hidden rounded-3xl border p-6 sm:p-9">
        <div className="bank-total-block text-center">
          <p className="text-xs font-black uppercase tracking-[0.2em]">Total Bread Bucks spent</p>
          <p className="mt-2 text-4xl font-black tabular-nums sm:text-5xl">{loading ? "…" : isGuest ? "0" : bank?.totalSpent.toLocaleString() || "0"}</p>
          <p className="mt-1 text-sm font-bold">Bread Bucks</p>
          <p className="mt-3 text-sm font-black">Shared bank balance: {loading ? "…" : (bank?.bankBalance || 0).toLocaleString()} Bread Bucks</p>
        </div>
        <img src="/assets/piggy bank.svg" alt="Piggy bank" className="mx-auto mt-5 h-48 w-48 object-contain drop-shadow-xl sm:h-56 sm:w-56" />
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="bank-breakdown rounded-xl border p-4"><p className="text-xs font-bold uppercase tracking-wide">Estimated past spending</p><p className="mt-1 text-2xl font-black tabular-nums">{loading ? "…" : (bank?.historicalEstimate || 0).toLocaleString()}</p></div>
          <div className="bank-breakdown rounded-xl border p-4"><p className="text-xs font-bold uppercase tracking-wide">Tracked since update</p><p className="mt-1 text-2xl font-black tabular-nums">{loading ? "…" : (bank?.trackedSpent || 0).toLocaleString()}</p></div>
        </div>
        <p className="bank-note mt-4 text-center text-xs leading-5">{isGuest ? "Sign in to keep a persistent spending total." : error || "Past spending is estimated from recorded bag openings and clan contributions. Every future token balance decrease is tracked automatically."}</p>
      </section>
    </div>
  );
}

type BanAppeal = { id: string; username: string; banReason: string; message: string; status: "pending" | "approved" | "declined"; note: string; createdAt: string };

// Ban appeals sent from the login screen; accepting one unbans the player.
function BanAppealsPanel() {
  const [appeals, setAppeals] = useState<BanAppeal[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/appeals", { cache: "no-store" }).catch(() => null);
    const result = await response?.json().catch(() => null);
    if (response?.ok && Array.isArray(result)) { setAppeals(result); setError(""); } else setError(result?.error || "Could not load appeals.");
  }, []);
  useEffect(() => { void load(); }, [load]);
  const decide = async (appeal: BanAppeal, decision: "approve" | "deny") => {
    setBusyId(appeal.id);
    const response = await fetch("/api/admin/appeals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: appeal.id, decision, note: notes[appeal.id] || "" }) }).catch(() => null);
    const result = await response?.json().catch(() => null);
    setBusyId("");
    if (!response?.ok) return setError(result?.error || "Could not save that decision.");
    void load();
  };
  const pending = appeals.filter((appeal) => appeal.status === "pending");
  const decided = appeals.filter((appeal) => appeal.status !== "pending").slice(0, 10);
  return (
    <div className="rounded-3xl border border-[#3d91cd] bg-[#103f75] p-6 shadow-md">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-black text-[#bde8ff]">⚖️ Ban Appeals {pending.length > 0 && <span className="ml-1 rounded-full bg-rose-500 px-2 py-0.5 text-sm">{pending.length}</span>}</h2>
        <button type="button" onClick={() => void load()} className="sidebar-dark-action rounded-lg px-4 py-2 text-sm font-bold">Refresh</button>
      </div>
      {error && <p className="mt-2 text-sm font-bold text-rose-200">{error}</p>}
      <div className="mt-3 space-y-3">
        {pending.map((appeal) => (
          <div key={appeal.id} className="rounded-xl bg-[#0c3b70] p-4">
            <p className="font-black">{appeal.username} <small className="font-bold opacity-60">· {new Date(appeal.createdAt).toLocaleString()}</small></p>
            {appeal.banReason && <p className="mt-1 text-xs font-bold opacity-75">Banned for: {appeal.banReason}</p>}
            <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-black/30 p-3 text-sm">{appeal.message}</p>
            <input value={notes[appeal.id] || ""} onChange={(event) => setNotes((current) => ({ ...current, [appeal.id]: event.target.value.slice(0, 300) }))} placeholder="Note to the player (optional, shown if denied)" className="mt-2 w-full rounded-lg bg-[#103f75] px-3 py-2 text-sm outline-none" />
            <div className="mt-2 flex gap-2">
              <button type="button" disabled={busyId === appeal.id} onClick={() => void decide(appeal, "approve")} className="flex-1 rounded-lg bg-emerald-300 px-4 py-2 text-sm font-black text-emerald-950 disabled:opacity-50">Accept · unban</button>
              <button type="button" disabled={busyId === appeal.id} onClick={() => void decide(appeal, "deny")} className="flex-1 rounded-lg bg-rose-300 px-4 py-2 text-sm font-black text-rose-950 disabled:opacity-50">Deny</button>
            </div>
          </div>
        ))}
        {!pending.length && <p className="text-sm opacity-70">No appeals waiting.</p>}
      </div>
      {decided.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-black">Recent decisions</summary>
          <div className="mt-2 space-y-1">{decided.map((appeal) => <p key={appeal.id} className="text-sm">{appeal.status === "approved" ? "✅" : "❌"} <b>{appeal.username}</b>: {appeal.message.slice(0, 80)}{appeal.message.length > 80 ? "…" : ""}</p>)}</div>
        </details>
      )}
    </div>
  );
}

type AltAccount = { id: string; username: string; created_at: string; is_banned: boolean; tokens: number; staff: boolean };

// Accounts seen on the same device / network (see /api/admin/alts), with ban buttons.
function AltSuspectsPanel() {
  const [groups, setGroups] = useState<{ sameDevice: AltAccount[][]; sameNetwork: AltAccount[][] } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/alts", { cache: "no-store" }).catch(() => null);
    const result = await response?.json().catch(() => null);
    if (response?.ok) { setGroups(result); setError(""); } else setError(result?.error || "Could not load suspected alts.");
  }, []);
  useEffect(() => { void load(); }, [load]);

  const ban = async (accounts: AltAccount[]) => {
    const targets = accounts.filter((account) => !account.is_banned && !account.staff);
    if (!targets.length) return;
    setBusy(true);
    for (const account of targets) {
      const response = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ban", targetId: account.id, reason: "Suspected alt account", permanent: true }) }).catch(() => null);
      if (!response?.ok) setError((await response?.json().catch(() => null))?.error || `Could not ban ${account.username}.`);
    }
    setBusy(false);
    void load();
  };

  const renderGroup = (group: AltAccount[], index: number, strong: boolean) => (
    <div key={index} className="rounded-xl bg-[#0c3b70] p-3">
      <div className="flex flex-wrap items-center gap-2">
        {group.map((account, position) => (
          <span key={account.id} className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-bold ${account.is_banned ? "bg-rose-900/60 line-through opacity-70" : "bg-[#103f75]"}`}>
            {account.username}{position === 0 ? " (oldest)" : ""}{account.staff ? " ⭐" : ""}
            <small className="opacity-60">{new Date(account.created_at).toLocaleDateString()}</small>
            {!account.is_banned && !account.staff && <button type="button" disabled={busy} onClick={() => void ban([account])} className="rounded bg-rose-500 px-1.5 text-xs font-black disabled:opacity-40">Ban</button>}
          </span>
        ))}
        {strong && group.slice(1).some((account) => !account.is_banned && !account.staff) && (
          <button type="button" disabled={busy} onClick={() => void ban(group.slice(1))} className="dark-action-button !py-1 text-xs disabled:opacity-40">Ban all alts (keep oldest)</button>
        )}
      </div>
    </div>
  );

  return (
    <div className="rounded-3xl border border-[#3d91cd] bg-[#103f75] p-6 shadow-md">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-black text-[#bde8ff]">🕵️ Suspected Alts</h2>
        <button type="button" onClick={() => void load()} className="sidebar-dark-action rounded-lg px-4 py-2 text-sm font-bold">Refresh</button>
      </div>
      <p className="mt-1 text-sm opacity-80">Accounts sharing a device are banned automatically the next time one of them logs in or loads the game (unless a staff ⭐ account is in the group or their appeal was accepted). Same-network groups are never auto-banned, since they could be a school or family.</p>
      {error && <p className="mt-2 text-sm font-bold text-rose-200">{error}</p>}
      {groups && (
        <>
          <h3 className="mt-4 font-black">Same device <span className="text-sm font-bold opacity-70">· strong sign of alts</span></h3>
          <div className="mt-2 space-y-2">{groups.sameDevice.length ? groups.sameDevice.map((group, index) => renderGroup(group, index, true)) : <p className="text-sm opacity-70">None found.</p>}</div>
          <h3 className="mt-4 font-black">Same network <span className="text-sm font-bold opacity-70">· could just be a school or family, check before banning</span></h3>
          <div className="mt-2 space-y-2">{groups.sameNetwork.length ? groups.sameNetwork.map((group, index) => renderGroup(group, index, false)) : <p className="text-sm opacity-70">None found.</p>}</div>
        </>
      )}
    </div>
  );
}

// Most players online at once (see /api/online-record), next to how many are on right now.
function OnlineRecordPanel({ onlineNow }: { onlineNow: number }) {
  const [record, setRecord] = useState<{ record: number; at: string | null } | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/online-record", { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (response?.ok && data) { setRecord(data); setError(""); } else setError(data?.error || "Could not load the record.");
  }, []);
  // Reload when the online count changes, so a new record shows up while you watch.
  useEffect(() => { void load(); }, [load, onlineNow]);
  const best = Math.max(record?.record || 0, onlineNow);
  return (
    <div className="rounded-3xl border border-[#3d91cd] bg-[#103f75] p-6 shadow-md">
      <h2 className="text-2xl font-black text-[#bde8ff]">🏆 Most Players Online</h2>
      <p className="mt-1 text-sm text-[#9cc8e8]">The record for the most players online at the same time.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-[#13120F] p-4">
          <p className="text-xs font-black uppercase tracking-widest opacity-70">Record</p>
          <p className="mt-1 text-4xl font-black text-[#ffcb73]">{best.toLocaleString()}</p>
          <p className="mt-1 text-sm font-bold opacity-80">{record?.at ? `Set ${new Date(record.at).toLocaleString()}` : "Not set yet"}</p>
        </div>
        <div className="rounded-2xl bg-[#13120F] p-4">
          <p className="text-xs font-black uppercase tracking-widest opacity-70">Online right now</p>
          <p className="mt-1 text-4xl font-black text-emerald-300">{onlineNow.toLocaleString()}</p>
          <p className="mt-1 text-sm font-bold opacity-80">{best > 0 ? `${Math.round((onlineNow / best) * 100)}% of the record` : ""}</p>
        </div>
      </div>
      {error && <p role="alert" className="mt-3 text-sm font-bold text-rose-200">{error}</p>}
    </div>
  );
}

// Evil AI mode for everyone for a set time, plus a quick toggle for the admin's own account.
function EvilAiAdminPanel() {
  const [globalUntil, setGlobalUntil] = useState<string | null>(null);
  const [selfActive, setSelfActive] = useState(false);
  const [minutes, setMinutes] = useState("30");
  const [status, setStatus] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const load = useCallback(async () => {
    const response = await fetch("/api/chat/evil", { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (response?.ok && data) {
      setGlobalUntil(data.globalUntil);
      setSelfActive(Boolean(data.selfActive));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const post = async (body: Record<string, unknown>) => {
    const response = await fetch("/api/chat/evil", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const data = await response?.json().catch(() => ({}));
    if (!response?.ok) return setStatus(data?.error || "Could not change evil AI mode.");
    setStatus("");
    if (body.scope === "global") setGlobalUntil(data.globalUntil);
    else setSelfActive(Boolean(data.active));
  };
  const remaining = globalUntil ? Math.max(0, Date.parse(globalUntil) - now) : 0;
  const globalOn = remaining > 0;
  return (
    <div className="rounded-3xl border border-[#3d91cd] bg-[#103f75] p-6 shadow-md">
      <h2 className="text-2xl font-black text-[#bde8ff]">😈 Evil AI Mode</h2>
      <p className="mt-1 text-sm text-[#9cc8e8]">While it's on, Breadlet answers /ai questions rudely.</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-wider ${globalOn ? "bg-rose-500/20 text-rose-200" : "bg-emerald-500/20 text-emerald-200"}`}>
          {globalOn ? `On for everyone · ${Math.floor(remaining / 60000)}:${String(Math.floor((remaining % 60000) / 1000)).padStart(2, "0")} left` : "Off for everyone"}
        </span>
        <label className="flex items-center gap-2 text-sm font-bold text-[#bde8ff]">
          <input value={minutes} onChange={(event) => setMinutes(event.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" aria-label="Minutes of evil AI mode for everyone" className="w-20 rounded-xl bg-[#0c3b70] px-3 py-2 text-white outline-none" />
          minutes
        </label>
        <button onClick={() => void post({ scope: "global", minutes: Number(minutes) })} disabled={!Number(minutes)} className="rounded-xl bg-rose-300 px-5 py-3 text-sm font-black text-rose-950 hover:bg-rose-200 disabled:opacity-50">{globalOn ? "Restart for everyone" : "Turn on for everyone"}</button>
        {globalOn && <button onClick={() => void post({ scope: "global", minutes: 0 })} className="rounded-xl bg-emerald-300 px-5 py-3 text-sm font-black text-emerald-950 hover:bg-emerald-200">Turn off for everyone</button>}
        <button onClick={() => void post({ scope: "player" })} className="rounded-xl border border-[#3d91cd] px-5 py-3 text-sm font-black text-[#bde8ff] hover:bg-[#18558f]">{selfActive ? "😇 Turn off for me" : "😈 Turn on for me (30m)"}</button>
      </div>
      {status && <p role="alert" className="mt-3 text-sm font-bold text-rose-200">{status}</p>}
      <p className="mt-3 text-xs text-[#9cc8e8]">To turn it on for one player, use the 😈 Evil AI button next to their name in chat.</p>
    </div>
  );
}

function AdminTab({
  player,
  onlineNow,
  grantReward,
  moderateAccount,
  announcement,
  setAnnouncement,
  publishAnnouncement,
  maintenanceModeActive,
  toggleMaintenance,
  grantGift,
}: {
  player: Player;
  onlineNow: number;
  grantReward: (targetId: string, reward: { operation?: "add" | "remove"; tokens?: number; candy?: number; blookName?: string; badge?: string; material?: string; materialAmount?: number }) => Promise<void>;
  moderateAccount: (action: "ban" | "delete", payload: Record<string, unknown>) => Promise<boolean>;
  announcement: string;
  setAnnouncement: (value: string) => void;
  publishAnnouncement: () => void;
  maintenanceModeActive: boolean;
  toggleMaintenance: (next: boolean) => Promise<void>;
  grantGift: (gift: { title: string; message: string; tokens: number; materials: Record<string, number>; badges: string[]; blooks: string[] }) => void;
}) {
  const [tokenAmount, setTokenAmount] = useState("100");
  const [candyAmount, setCandyAmount] = useState("10");
  const [blookSearch, setBlookSearch] = useState("");
  const [banReason, setBanReason] = useState("");
  const [banDuration, setBanDuration] = useState("24");
  const [banPermanent, setBanPermanent] = useState(false);
  const [giftTitle, setGiftTitle] = useState("");
  const [giftMessage, setGiftMessage] = useState("");
  const [giftBlook, setGiftBlook] = useState("");
  const [giftBadge, setGiftBadge] = useState("");
  const [giftMaterial, setGiftMaterial] = useState("Gold");
  const [giftMaterialAmount, setGiftMaterialAmount] = useState("0");
  const [resourceMaterial, setResourceMaterial] = useState("Gold");
  const [resourceMaterialAmount, setResourceMaterialAmount] = useState("10");
  const [players, setPlayers] = useState<{ id: string; username: string; is_banned?: boolean; ban_reason?: string | null }[]>([]);
  const [targetId, setTargetId] = useState("");
  const [targetSearch, setTargetSearch] = useState("");

  useEffect(() => {
    fetch("/api/admin").then(async (response) => {
      if (!response.ok) return;
      const rows = await response.json();
      if (Array.isArray(rows)) {
        setPlayers(rows);
        setTargetId((current) => current || rows[0]?.id || "");
        setTargetSearch((current) => current || rows[0]?.username || "");
      }
    }).catch(() => undefined);
  }, []);

  const allBlooks = Array.from(new Set(
    [...liveCapsules, ...legacyCapsules].flatMap((capsule) => capsule.pool.map((reward) => reward.name))
      .concat(craftRecipes.map((recipe) => recipe.name)),
  )).sort((left, right) => left.localeCompare(right));

  const filteredBlooks = allBlooks.filter((b) =>
    b.toLowerCase().includes(blookSearch.toLowerCase())
  );
  const filteredPlayers = players.filter((profile) => profile.username.toLowerCase().includes(targetSearch.trim().toLowerCase()));

  return (
    <div className="max-w-6xl space-y-6">
      <AdminAbusePanel />
      <BanAppealsPanel />
      <AltSuspectsPanel />
      <div className="rounded-3xl border border-[#73c8ff]/50 bg-[#18558f] p-8 shadow-xl">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#bde8ff]">
          Developer & Operator Controls
        </p>
        <h1 className="page-sign mt-2 text-4xl font-black text-white">Admin Panel</h1>
        <p className="mt-3 leading-7 text-[#d9f3ff]">
          Select a real player, then manage resources, Breadlets, and badges through the server-side admin role.
        </p>
        <label className="mt-5 block max-w-md text-sm font-bold text-white">Find player account
            <input value={targetSearch} onChange={(event) => { const query = event.target.value; setTargetSearch(query); const exact = players.find((profile) => profile.username.toLowerCase() === query.trim().toLowerCase()); setTargetId(exact?.id || ""); }} placeholder="Type a username" className="mt-2 w-full rounded-xl border border-[#3d91cd] bg-[#0c3b70] px-3 py-2 text-white" />
            <select aria-label="Matching player accounts" value={targetId} onChange={(event) => { const id = event.target.value; setTargetId(id); setTargetSearch(players.find((profile) => profile.id === id)?.username || ""); }} className="mt-2 w-full rounded-xl border border-[#3d91cd] bg-[#bde8ff] px-3 py-2 text-[#062443]">
            {filteredPlayers.map((profile) => <option className="text-[#062443]" key={profile.id} value={profile.id}>{profile.username}</option>)}
          </select>
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className={`text-xs font-bold ${players.find((profile) => profile.id === targetId)?.is_banned ? "text-rose-200" : "text-emerald-200"}`}>{players.find((profile) => profile.id === targetId)?.is_banned ? `Banned · ${players.find((profile) => profile.id === targetId)?.ban_reason || "No reason recorded"}` : "Active account"}</span>
          <button disabled={!targetId || targetId === player.id} onClick={async () => {
            const selected = players.find((profile) => profile.id === targetId);
            if (!selected || !window.confirm(`Permanently delete ${selected.username}? Their username will become available again.`)) return;
            const deleted = await moderateAccount("delete", { targetId });
            if (deleted) setPlayers((current) => current.filter((profile) => profile.id !== targetId));
          }} className="rounded-lg border border-rose-300/40 px-3 py-2 text-xs font-black text-rose-100 disabled:opacity-40">Delete account</button>
        </div>
      </div>

      {/* Quick Grants & Exact Token Grant */}
      <section className="border-y-2 border-[#CC5500] py-5">
        <h2 className="flex items-center gap-2 text-xl font-bold"><img src="/assets/Candy.svg" alt="" className="h-8 w-8 object-contain" />Contest of Spooky Candy</h2>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="min-w-0 text-sm font-bold">Candy amount
            <input aria-label="Candy amount" value={candyAmount} onChange={(event) => setCandyAmount(event.target.value)} type="number" min="1" max="1000000" step="1" className="mt-2 block w-40 rounded-lg border border-[#CC5500] bg-[#ED7117] px-3 py-3" />
          </label>
          <button disabled={!targetId || !Number.isSafeInteger(Number(candyAmount)) || Number(candyAmount) < 1 || Number(candyAmount) > 1000000} onClick={() => void grantReward(targetId, { operation: "add", candy: Number(candyAmount) })} className="sidebar-dark-action rounded-lg px-4 py-3 font-bold disabled:opacity-40">Add Candy</button>
          <button disabled={!targetId || !Number.isSafeInteger(Number(candyAmount)) || Number(candyAmount) < 1 || Number(candyAmount) > 1000000} onClick={() => void grantReward(targetId, { operation: "remove", candy: Number(candyAmount) })} className="sidebar-dark-action rounded-lg px-4 py-3 font-bold disabled:opacity-40">Remove Candy</button>
        </div>
      </section>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-3xl border border-[#3d91cd] bg-[#103f75] p-6 shadow-md">
          <h2 className="text-xl font-black text-[#bde8ff] flex items-center gap-2">
            <img src="/assets/Bread%20bucks.svg" alt="" className="h-6 w-6" /> Token Controls
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[100, 1000, 10000, 100000].map((amt) => (
              <div key={amt} className="grid grid-cols-2 overflow-hidden rounded-xl border border-[#3d91cd]/50">
                <button onClick={() => grantReward(targetId, { operation: "add", tokens: amt })} className="bg-[#18558f] p-3 font-black text-[#ffe2a0] hover:bg-[#24649c]">+{amt.toLocaleString()}</button>
                <button onClick={() => grantReward(targetId, { operation: "remove", tokens: amt })} className="bg-rose-950/50 p-3 font-black text-rose-100 hover:bg-rose-900">-{amt.toLocaleString()}</button>
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-3">
            <input
              value={tokenAmount}
              onChange={(e) => setTokenAmount(e.target.value)}
              type="number"
              min="0"
              placeholder="Custom Bread Bucks amount"
              className="min-w-0 flex-1 rounded-xl border border-[#3d91cd] bg-[#0c3b70] px-4 py-3 text-white outline-none"
            />
            <button onClick={() => grantReward(targetId, { operation: "add", tokens: Number(tokenAmount) || 0 })} className="rounded-xl bg-[#39a8f5] px-4 py-3 font-black text-[#031426] hover:bg-[#73c8ff]">Add</button>
            <button onClick={() => grantReward(targetId, { operation: "remove", tokens: Number(tokenAmount) || 0 })} className="rounded-xl bg-rose-300 px-4 py-3 font-black text-rose-950 hover:bg-rose-200">Remove</button>
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
            <h2 className="text-2xl font-black text-[#bde8ff]">Bread Controls</h2>
            <p className="mt-1 text-sm text-[#9cc8e8]">Add or remove one copy from the selected player.</p>
          </div>
          <input
            value={blookSearch}
            onChange={(e) => setBlookSearch(e.target.value)}
            placeholder="Search Bread..."
            className="w-56 rounded-xl border border-[#3d91cd] bg-[#0c3b70] px-3 py-2 text-sm text-white outline-none"
          />
        </div>
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 max-h-96 overflow-y-auto pr-1">
          {filteredBlooks.map((name) => (
            <div key={name} className="group flex flex-col items-center justify-between rounded-2xl border border-[#3d91cd]/40 bg-[#18558f] p-3 text-center">
              <div className="flex h-16 w-16 items-center justify-center">
                <RewardArt name={name} art={artFor(name)} className="h-full w-full object-contain" />
              </div>
              <span className="mt-2 text-xs font-black text-[#bde8ff] truncate w-full">{name}</span>
              <div className="mt-2 grid w-full grid-cols-2 gap-1"><button onClick={() => grantReward(targetId, { operation: "add", blookName: name })} className="rounded-md bg-sky-300 py-1 text-[10px] font-black text-sky-950">Add</button><button onClick={() => grantReward(targetId, { operation: "remove", blookName: name })} className="rounded-md bg-rose-300 py-1 text-[10px] font-black text-rose-950">Remove</button></div>
            </div>
          ))}
        </div>
      </div>

      <OnlineRecordPanel onlineNow={onlineNow} />
      <EvilAiAdminPanel />

      {/* Maintenance Mode */}
      <div className="rounded-3xl border border-[#3d91cd] bg-[#103f75] p-6 shadow-md">
        <h2 className="text-2xl font-black text-[#bde8ff]">Maintenance Mode</h2>
        <p className="mt-1 text-sm text-[#9cc8e8]">Blocks every player behind the maintenance screen until you turn it back off.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-wider ${maintenanceModeActive ? "bg-rose-500/20 text-rose-200" : "bg-emerald-500/20 text-emerald-200"}`}>{maintenanceModeActive ? "Maintenance is ON" : "Maintenance is OFF"}</span>
          <button
            onClick={() => void toggleMaintenance(!maintenanceModeActive)}
            className={`rounded-xl px-5 py-3 text-sm font-black transition ${maintenanceModeActive ? "bg-emerald-300 text-emerald-950 hover:bg-emerald-200" : "bg-rose-300 text-rose-950 hover:bg-rose-200"}`}
          >
            {maintenanceModeActive ? "Turn maintenance off" : "Turn maintenance on"}
          </button>
        </div>
      </div>

      {/* Grant Badges */}
      <div className="rounded-3xl border border-[#3d91cd] bg-[#103f75] p-6 shadow-md">
        <h2 className="text-2xl font-black text-[#bde8ff]">Badge Controls</h2>
        <p className="mt-1 text-sm text-[#9cc8e8]">Add or remove badges from the selected player.</p>
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {grantableBadges.map((name) => ({ name, icon: badgeIconFor(name), desc: name === "Verified" ? `${badgeDescriptions[name]} (Unlocks Chat Image Upload)` : badgeDescriptions[name] })).map((b) => (
            <div key={b.name} className="flex items-center gap-3 rounded-2xl border border-[#3d91cd]/40 bg-[#18558f] p-4 text-left">
              <img src={b.icon} alt={b.name} className="h-12 w-12 object-contain" />
              <div className="min-w-0 flex-1">
                <p className="font-black text-[#bde8ff]">{b.name}</p>
                <p className="text-xs text-[#9cc8e8]">{b.desc}</p>
                <div className="mt-2 flex gap-2"><button onClick={() => grantReward(targetId, { operation: "add", badge: b.name })} className="rounded-md bg-sky-300 px-3 py-1 text-xs font-black text-sky-950">Add</button><button onClick={() => grantReward(targetId, { operation: "remove", badge: b.name })} className="rounded-md bg-rose-300 px-3 py-1 text-xs font-black text-rose-950">Remove</button></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-[#3d91cd] bg-[#103f75] p-6 shadow-md">
        <h2 className="text-2xl font-black text-[#bde8ff]">Material Controls</h2>
        <p className="mt-1 text-sm text-[#9cc8e8]">Add or remove crafting materials from the selected player.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <select value={resourceMaterial} onChange={(event) => setResourceMaterial(event.target.value)} className="rounded-xl border border-[#3d91cd] bg-[#0c3b70] px-4 py-3 text-white">
            {materialNames.map((material) => <option key={material}>{material}</option>)}
          </select>
          <input value={resourceMaterialAmount} onChange={(event) => setResourceMaterialAmount(event.target.value)} type="number" min="1" className="min-w-0 flex-1 rounded-xl border border-[#3d91cd] bg-[#0c3b70] px-4 py-3 text-white" />
          <button onClick={() => grantReward(targetId, { operation: "add", material: resourceMaterial, materialAmount: Number(resourceMaterialAmount) || 0 })} className="rounded-xl bg-sky-300 px-5 py-3 font-black text-sky-950">Add</button>
          <button onClick={() => grantReward(targetId, { operation: "remove", material: resourceMaterial, materialAmount: Number(resourceMaterialAmount) || 0 })} className="rounded-xl bg-rose-300 px-5 py-3 font-black text-rose-950">Remove</button>
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
              <input value={giftBlook} onChange={(e) => setGiftBlook(e.target.value)} placeholder="Bread Name" className="rounded-xl border border-[#3d91cd] bg-[#0c3b70] px-3 py-2.5 text-sm text-white" />
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
          <p className="mt-1 text-sm text-[#f2b9c7]">Ban the selected account. Its reason is shown when the player next logs in.</p>
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <input disabled={banPermanent} value={banDuration} onChange={(e) => setBanDuration(e.target.value)} type="number" min="1" placeholder="Duration (Hours)" className="rounded-xl border border-[#b85a77] bg-[#351c3a] px-3 py-2.5 text-sm text-white disabled:opacity-40" />
              <input value={banReason} onChange={(e) => setBanReason(e.target.value)} placeholder="Reason" className="rounded-xl border border-[#b85a77] bg-[#351c3a] px-3 py-2.5 text-sm text-white" />
            </div>
            <label className="flex items-center gap-2 text-sm font-bold text-rose-100"><input type="checkbox" checked={banPermanent} onChange={(event) => setBanPermanent(event.target.checked)} className="h-4 w-4 accent-rose-400" />Permanent ban</label>
            <button
              disabled={!targetId || !banReason.trim() || (!banPermanent && Number(banDuration) < 1)}
              onClick={async () => {
                const selected = players.find((profile) => profile.id === targetId);
                if (!selected || !window.confirm(`Ban ${selected.username}${banPermanent ? " permanently" : ` for ${banDuration} hours`}?`)) return;
                const banned = await moderateAccount("ban", { targetId, reason: banReason.trim(), permanent: banPermanent, durationHours: Number(banDuration) });
                if (banned) {
                  setPlayers((current) => current.map((profile) => profile.id === targetId ? { ...profile, is_banned: true, ban_reason: banReason.trim() } : profile));
                  setBanReason("");
                }
              }}
              className="w-full rounded-xl bg-[#ef8b9d] px-4 py-3 font-black text-[#351c3a] hover:bg-[#ffb3c1] disabled:opacity-40"
            >
              Issue Ban Sanction
            </button>
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
  const [tags, setTags] = useState<string[]>([]);
  const [profileBlook, setProfileBlook] = useState("");
  const [blookSearch, setBlookSearch] = useState("");
  const [availableBlooks, setAvailableBlooks] = useState<{ name: string; rarity: string; artworkKey?: string }[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [createError, setCreateError] = useState("");
  const [clan, setClanState] = useState<ClanRecord | null>(null);
  const [membershipClanId, setMembershipClanId] = useState("");
  const [filter, setFilter] = useState("");
  const [dbClans, setDbClans] = useState<ClanRecord[]>([]);
  const [clanMembers, setClanMembers] = useState<ClanMemberRecord[]>([]);
  const [requests, setRequests] = useState<ClanJoinRequest[]>([]);
  const [myRequests, setMyRequests] = useState<{ id: string; clanId: string; status: string }[]>([]);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [renamedClan, setRenamedClan] = useState("");

  const toClanRecord = (entry: Record<string, unknown>): ClanRecord => ({
    id: typeof entry.id === "string" ? entry.id : undefined,
    name: typeof entry.name === "string" ? entry.name : "Clan",
    description: typeof entry.description === "string" ? entry.description : "",
    tags: Array.isArray(entry.tags) ? entry.tags.filter((tag): tag is string => typeof tag === "string") : [],
    members: Number(entry.member_count) || 1,
    treasury: Number(entry.treasury) || 0,
    thumbnailUrl: typeof entry.thumbnail_url === "string" ? entry.thumbnail_url : "",
    profileBlook: typeof entry.profile_blook === "string" ? entry.profile_blook : "",
    bannerData: typeof entry.banner_data === "string" ? entry.banner_data : "",
    ownerProfileId: typeof entry.owner_profile_id === "string" ? entry.owner_profile_id : undefined,
    ownerName: typeof entry.owner_name === "string" ? entry.owner_name : "",
    role: typeof entry.role === "string" ? entry.role : undefined,
    memberCapacity: Number(entry.member_capacity) || 25,
    nameChangeUnlocked: Boolean(entry.name_change_unlocked),
    bannerUnlocked: Boolean(entry.banner_unlocked),
    colorsUnlocked: Boolean(entry.colors_unlocked),
    theme: typeof entry.theme === "string" ? entry.theme : "breadlet",
    animatedProfiles: Boolean(entry.animated_profiles),
  });

  const loadClans = useCallback(async () => {
    try {
      const res = await fetch("/api/clans", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Clans could not be loaded.");
      if (!Array.isArray(data.clans)) throw new Error("The clan service returned an invalid list.");
      setAvailableBlooks(Array.isArray(data.blooks) ? data.blooks.filter((blook: Record<string, unknown>) =>
        typeof blook.name === "string" && typeof blook.rarity === "string",
      ).map((blook: Record<string, unknown>) => ({
        name: String(blook.name),
        rarity: String(blook.rarity),
        artworkKey: typeof blook.artwork_key === "string" ? blook.artwork_key : undefined,
      })) : []);
      const joinedClanId = String(data.membership?.clan_id || "");
      const list = data.clans.map((entry: Record<string, unknown>) => toClanRecord({
        ...entry,
        role: entry.id === joinedClanId ? data.membership?.role : undefined,
      }));
      setDbClans(list);
      setMembershipClanId(joinedClanId);
      setClanMembers(Array.isArray(data.members) ? data.members.map((member: Record<string, unknown>) => ({
        profileId: String(member.profileId || ""),
        username: String(member.username || "Player"),
        role: String(member.role || "member"),
        tokenContributions: Number(member.tokenContributions) || 0,
        equippedBlook: typeof member.equippedBlook === "string" ? member.equippedBlook : "",
      })) : []);
      setRequests(Array.isArray(data.requests) ? data.requests.map((request: Record<string, unknown>) => ({
        id: String(request.id),
        clanId: String(request.clan_id),
        username: String(request.username || "Player"),
        createdAt: String(request.created_at || ""),
      })) : []);
      setMyRequests(Array.isArray(data.myRequests) ? data.myRequests.map((request: Record<string, unknown>) => ({
        id: String(request.id),
        clanId: String(request.clan_id),
        status: String(request.status),
      })) : []);
      const myClan: ClanRecord | undefined = list.find((entry: ClanRecord) => entry.id === joinedClanId)
        || list.find((entry: ClanRecord) => Boolean(player.clanTag && entry.name.toUpperCase().startsWith(player.clanTag)));
      setClanState(myClan || null);
      if (myClan) setRenamedClan(myClan.name);
      setCreateError("");
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Clans could not be loaded.");
    }
  }, [player.clanTag]);

  useEffect(() => {
    loadClans();
  }, [loadClans]);

  const allClans = dbClans;

  const clans = allClans.filter((item) => !filter || item.tags.some((tag) => tag.toLowerCase().includes(filter.toLowerCase())) || item.name.toLowerCase().includes(filter.toLowerCase()));
  const clanBlookArt = (name: string) => artForBlook(name, availableBlooks.find((blook) => blook.name === name)?.artworkKey);
  const selectableBlooks = availableBlooks.filter((blook) => blook.name.toLowerCase().includes(blookSearch.trim().toLowerCase()));
  const isOwner = Boolean(clan?.id && player.id && clan.ownerProfileId === player.id);
  const pendingByClan = new Map(myRequests.filter((request) => request.status === "pending").map((request) => [request.clanId, request.id]));
  const themeNames: Record<string, string> = { breadlet: "Breadlet", ocean: "Ocean", sunset: "Sunset", forest: "Forest", royal: "Royal", ember: "Ember" };

  const handleCreateClan = async () => {
    setCreateError("");
    if (!name.trim() || tags.length > 3) return;
    if (!availableBlooks.some((blook) => blook.name === profileBlook)) {
      setCreateError("Choose a Blook for your clan profile.");
      return;
    }
    if (!isGuest && player.tokens < 5000) {
      setCreateError("Creating a clan requires 5,000 Bread Bucks.");
      return;
    }
    if (isGuest) {
      setClanState({
        name, description, tags, members: 1, treasury: 0, profileBlook,
        memberCapacity: 25, nameChangeUnlocked: false, bannerUnlocked: false,
        colorsUnlocked: false, theme: "breadlet", animatedProfiles: false,
      });
      setClanMembers([{ profileId: "guest", username: player.username, role: "leader", tokenContributions: 0, equippedBlook: player.equipped }]);
      setClan(name.slice(0, 5));
      setShowCreate(false);
      return;
    }
    try {
      const res = await fetch("/api/clans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim(), tags, profileBlook }),
      });
      if (res.ok) {
        const data = await res.json();
        savePlayer({ ...player, tokens: player.tokens - 5000 });
        if (data.clan && typeof data.clan === "object") {
          setClanState(toClanRecord(data.clan));
        } else {
          throw new Error("The clan service returned an invalid clan.");
        }
        setClan(name.slice(0, 5));
        setShowCreate(false);
        loadClans();
        return;
      }
      const data = await res.json().catch(() => ({}));
      setCreateError(data.error || "The clan could not be created.");
      return;
    } catch {
      setCreateError("The clan server could not be reached. Try again.");
      return;
    }
  };

  const handleRequestClan = async (targetClan: ClanRecord) => {
    if (!targetClan.id || isGuest) return;
    if (membershipClanId) {
      setCreateError("Leave your current clan before requesting to join another.");
      return;
    }
    setCreateError("");
    try {
      const response = await fetch("/api/clans", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request", clanId: targetClan.id }),
      });
      const result = await response.json();
      if (!response.ok) {
        setCreateError(result.error || "The clan could not be joined.");
        return;
      }
      await loadClans();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "The clan server could not be reached.");
    }
  };

  const reviewRequest = async (requestId: string, decision: "approved" | "declined") => {
    if (!clan?.id) return;
    const response = await fetch("/api/clans", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "review_request", requestId, decision }),
    });
    const result = await response.json();
    if (!response.ok) {
      setCreateError(result.error || "The clan request could not be reviewed.");
      return;
    }
    if (decision === "approved") setClan(String(clan.name.slice(0, 5).toUpperCase()));
    await loadClans();
  };

  const upgradeClan = async (feature: string, value?: string) => {
    if (!clan?.id) return;
    const response = await fetch("/api/clans", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "upgrade", clanId: clan.id, feature, value }),
    });
    const result = await response.json();
    if (!response.ok) {
      setCreateError(result.error || "The clan upgrade could not be purchased.");
      return;
    }
    const updated = toClanRecord(result.clan);
    setClanState(updated);
    setDbClans((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
    setRenamedClan(updated.name);
  };

  const uploadClanBanner = async (file: File) => {
    if (!clan?.id) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setCreateError("Choose a PNG, JPEG, or WebP banner.");
      return;
    }
    if (file.size > 10_000_000) {
      setCreateError("Choose a source image smaller than 10 MB.");
      return;
    }
    try {
      const sourceUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("The banner image could not be read."));
        reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("The banner image could not be read."));
        reader.readAsDataURL(file);
      });
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const loadedImage = new Image();
        loadedImage.onerror = () => reject(new Error("The banner image could not be decoded."));
        loadedImage.onload = () => resolve(loadedImage);
        loadedImage.src = sourceUrl;
      });
      const scale = Math.min(1, 1800 / image.naturalWidth, 560 / image.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Your browser could not prepare the banner image.");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL("image/jpeg", 0.82);
      if (data.length > 1_400_000) throw new Error("The optimized banner is still over 1 MB. Choose a smaller image.");
      const response = await fetch("/api/clans/banner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clanId: clan.id, data }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The banner could not be uploaded.");
      const updated = { ...clan, bannerData: data };
      setClanState(updated);
      setDbClans((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "The banner could not be uploaded.");
    }
  };

  const renameClan = async () => {
    const trimmedName = renamedClan.trim();
    if (trimmedName === clan?.name) return;
    await upgradeClan("rename", trimmedName);
    if (trimmedName.length >= 2 && trimmedName.length <= 30) setClan(trimmedName.slice(0, 5).toUpperCase());
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
          void loadClans();
          return;
        }
        setCreateError((await res.json().catch(() => ({}))).error || "Donation failed.");
        return;
      } catch {
        setCreateError("Could not reach the clan server.");
        return;
      }
    }
    setCreateError("Your clan could not be loaded. Refresh and retry.");
  };

  const handleLeaveClan = async () => {
    if (!clan?.id || isGuest) return;
    const response = await fetch("/api/clans", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "leave", clanId: clan.id }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setCreateError(result.error || "The clan could not be left.");
      return;
    }
    setClanState(null);
    setClanMembers([]);
    setMembershipClanId("");
    setClan("");
    await loadClans();
  };

  const upgradeOptions = [
    { feature: "rename_unlock", title: "Custom clan name", detail: "Unlock the ability to rename your clan.", price: 5000, owned: clan?.nameChangeUnlocked || false },
    { feature: "banner_unlock", title: "Clan banner", detail: "Upload a wide banner visible to every clan member.", price: 10000, owned: clan?.bannerUnlocked || false },
    { feature: "colors_unlock", title: "Clan colors", detail: "Unlock six curated color themes for your clan profile.", price: 15000, owned: clan?.colorsUnlocked || false },
    { feature: "member_capacity", title: "More members", detail: "Add 5 places, up to 100 clan members.", price: 20000, owned: (clan?.memberCapacity || 25) >= 100, level: clan ? `${clan.memberCapacity}/100` : "" },
    { feature: "animated_profiles", title: "Animated profile", detail: "Add a subtle animated finish to your clan profile.", price: 30000, owned: clan?.animatedProfiles || false },
  ];
  const themeOptions = ["breadlet", "ocean", "sunset", "forest", "royal", "ember"];

  return (
    <div className="clan-workspace space-y-6">
      {createError && <div role="alert" className="clan-error fixed bottom-5 left-1/2 z-[10001] flex w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 items-center justify-between gap-4 rounded-xl border px-4 py-3 text-sm font-bold shadow-2xl"><span>{createError}</span><button type="button" onClick={() => setCreateError("")} aria-label="Dismiss clan error">×</button></div>}
      {clan ? (
        <div className="clan-header">
          <div className="clan-identity">
            <span className={`clan-emblem ${clan.profileBlook ? "clan-emblem-blook" : ""}`}>
              {clan.profileBlook
                ? <img src={clanBlookArt(clan.profileBlook)} alt={`${clan.profileBlook} clan profile`} className="clan-profile-blook" />
                : clan.thumbnailUrl ? <img src={clan.thumbnailUrl} alt="" /> : <span aria-hidden="true">{clan.name.slice(0, 1).toUpperCase()}</span>}
            </span>
            <div className="min-w-0">
              <h1 className="clan-name">{clan.name}</h1>
              <div className="clan-header-stats">
                <span className="clan-meta"><Users size={16} />{clan.members}/{clan.memberCapacity} members</span>
                <span className="clan-meta"><Wallet size={16} />{clan.treasury.toLocaleString()} tokens</span>
              </div>
            </div>
          </div>
          <div className="clan-actions">
            <button type="button" onClick={() => setDiscoverOpen((open) => !open)} className="clan-action clan-action-discover"><Search size={18} />{discoverOpen ? "Hide discovery" : "Discover"}</button>
            <button type="button" onClick={handleDonate} className="clan-action clan-action-deposit"><Wallet size={18} />Deposit 100</button>
            {isOwner && <button type="button" onClick={() => document.getElementById("clan-upgrades")?.scrollIntoView({ behavior: "smooth", block: "start" })} className="clan-action clan-action-upgrades"><Sparkles size={18} />Upgrades</button>}
            {!isGuest && <button type="button" onClick={() => void handleLeaveClan()} className="clan-action clan-action-leave"><LogOut size={18} />Leave</button>}
            {!membershipClanId && <button type="button" aria-label="Create a clan" onClick={() => setShowCreate(true)} className="clan-action clan-action-discover"><Users size={18} />Create</button>}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div><p className="clan-eyebrow text-xs font-black uppercase tracking-[0.2em]">Breadlet communities</p><h1 className="page-sign mt-1 text-4xl font-black">Clans</h1></div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setDiscoverOpen((open) => !open)} className="clan-primary-button flex items-center gap-2 rounded-xl px-4 py-3 font-black"><Search size={18} />{discoverOpen ? "Hide discovery" : "Discover clans"}</button>
            <button type="button" aria-label="Create a clan" onClick={() => setShowCreate(true)} className="clan-secondary-button flex items-center gap-2 rounded-xl px-4 py-3 font-black"><Users size={19} />Create Clan</button>
          </div>
        </div>
      )}

      {showCreate && <div className="modal-layer fixed inset-0 z-[10000] flex items-center justify-center overflow-y-auto bg-black/75 px-5 py-6 backdrop-blur-sm">
        <div className="clan-panel w-full max-w-2xl rounded-3xl border p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-black">Create a clan · {isGuest ? "FREE" : "5,000 Bread Bucks"}</h2>
            <button type="button" onClick={() => setShowCreate(false)} className="clan-text-muted">Close</button>
          </div>
          <label className="clan-text-muted mt-4 block text-sm font-bold" htmlFor="clan-profile-blook-search">Choose any Blook as your clan profile</label>
          <input
            id="clan-profile-blook-search"
            value={blookSearch}
            onChange={(event) => setBlookSearch(event.target.value)}
            placeholder="Search Blooks"
            className="clan-input mt-2 w-full rounded-xl border px-3 py-3"
          />
          {availableBlooks.length ? <div className="clan-blook-picker mt-3 grid max-h-64 grid-cols-3 gap-2 overflow-y-auto p-1 sm:grid-cols-4">
            {selectableBlooks.map((blook) => <button
              key={blook.name}
              type="button"
              aria-pressed={profileBlook === blook.name}
              onClick={() => setProfileBlook(blook.name)}
              className={`clan-blook-choice flex min-w-0 flex-col items-center rounded-xl border p-2 text-center ${profileBlook === blook.name ? "clan-blook-choice-selected" : ""}`}
            >
              <img src={artForBlook(blook.name, blook.artworkKey)} alt="" className="h-14 w-14 object-contain" />
              <span className="mt-1 w-full truncate text-xs font-black">{blook.name}</span>
              <span className="clan-text-muted text-[10px]">{blook.rarity}</span>
            </button>)}
            {!selectableBlooks.length && <p className="clan-text-muted col-span-full py-6 text-center text-sm">No Blooks match that search.</p>}
          </div> : <p className="clan-text-muted mt-3 rounded-xl border border-white/10 p-4 text-sm">Loading the Blook collection…</p>}
          <div className="mt-4 grid gap-3">
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Clan name" className="clan-input rounded-xl border px-3 py-3" />
            <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description" className="clan-input rounded-xl border px-3 py-3" />
            <input value={tags.join(", ")} onChange={(event) => setTags(event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 3))} placeholder="Up to 3 tags" className="clan-input rounded-xl border px-3 py-3" />
          </div>
          <button type="button" disabled={!profileBlook || !availableBlooks.some((blook) => blook.name === profileBlook)} onClick={handleCreateClan} className="clan-primary-button mt-4 w-full rounded-xl px-4 py-3 font-black disabled:cursor-not-allowed disabled:opacity-45">Create clan</button>
        </div>
      </div>}

      {clan && (
        <section className={`clan-profile clan-theme-${clan.theme} ${clan.animatedProfiles ? "clan-profile-animated" : ""}`}>
          {clan.bannerData && <img src={clan.bannerData} alt={`${clan.name} clan banner`} className="clan-banner" />}
          <div className="clan-profile-content">
            {clan.description && <p className="clan-text-muted mb-3">{clan.description}</p>}
            {clan.tags.length > 0 && <div className="mb-4 flex flex-wrap gap-2">{clan.tags.map((tag) => <span key={tag} className="clan-tag rounded-full px-3 py-1 text-xs font-bold">#{tag}</span>)}</div>}
            <div className="clan-members-heading"><div><p className="clan-eyebrow text-xs font-black uppercase tracking-widest">The community</p><h2 className="mt-1 text-2xl font-black">Clan members</h2></div><span>{clanMembers.length || clan.members} players</span></div>
            <div className="clan-member-grid">
              {clanMembers.map((member) => (
                <article key={member.profileId || member.username} className="clan-member-card">
                  <span className="clan-member-avatar">
                    {member.equippedBlook ? <img src={clanBlookArt(member.equippedBlook)} alt="" className="h-12 w-12 object-contain" /> : <span aria-hidden="true">{member.username.slice(0, 1).toUpperCase()}</span>}
                  </span>
                  <div className="clan-member-copy">
                    <span className="clan-member-contribution">Contributed ({member.tokenContributions.toLocaleString()})</span>
                    <strong>{member.username}</strong>
                    <span className="clan-member-role">{member.role === "leader" ? <><Crown size={14} /> Leader</> : member.role === "admin" ? "Admin" : "Member"}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {isOwner && clan && (
        <>
          <section className="clan-panel rounded-3xl border p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="clan-eyebrow text-xs font-black uppercase tracking-widest">Owner controls</p><h2 className="mt-1 text-2xl font-black">Clan requests</h2></div><span className="clan-text-muted text-sm">{requests.length} waiting</span></div>
            {requests.length ? <div className="mt-4 divide-y divide-white/10">{requests.filter((request) => request.clanId === clan.id).map((request) => <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><strong>{request.username}</strong><p className="clan-text-muted text-xs">Requested {new Date(request.createdAt).toLocaleDateString()}</p></div><div className="flex gap-2"><button type="button" onClick={() => void reviewRequest(request.id, "approved")} className="clan-primary-button rounded-lg px-3 py-2 text-sm font-black">Approve</button><button type="button" onClick={() => void reviewRequest(request.id, "declined")} className="clan-secondary-button rounded-lg px-3 py-2 text-sm font-black">Decline</button></div></div>)}</div> : <p className="clan-text-muted mt-4 text-sm">No join requests right now.</p>}
          </section>

          <section id="clan-upgrades" className="clan-panel scroll-mt-6 rounded-3xl border p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="clan-eyebrow text-xs font-black uppercase tracking-widest">Chapter 2</p><h2 className="mt-1 text-2xl font-black">Clan upgrades</h2><p className="clan-text-muted mt-1 text-sm">Owners spend the shared treasury to unlock clan features.</p></div><span className="clan-treasury rounded-full px-3 py-1.5 text-sm font-black">{clan.treasury.toLocaleString()} tokens</span></div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {upgradeOptions.map((upgrade) => <article key={upgrade.feature} className="clan-upgrade-card rounded-2xl border p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-black">{upgrade.title}{upgrade.level ? <span className="clan-eyebrow ml-2 text-xs">{upgrade.level}</span> : null}</h3><p className="clan-text-muted mt-1 text-sm leading-5">{upgrade.detail}</p></div>{upgrade.owned && <span className="clan-owned-badge rounded-full px-2.5 py-1 text-[10px] font-black uppercase">Unlocked</span>}</div><button type="button" disabled={isGuest || upgrade.owned || clan.treasury < upgrade.price} onClick={() => void upgradeClan(upgrade.feature)} className="clan-upgrade-button mt-4 w-full rounded-lg px-3 py-2.5 text-sm font-black disabled:cursor-not-allowed disabled:opacity-45">{upgrade.owned ? "Purchased" : `Unlock · ${upgrade.price.toLocaleString()} Bread Bucks`}</button></article>)}
            </div>
            {clan.nameChangeUnlocked && <div className="mt-5 flex flex-col gap-2 sm:flex-row"><input aria-label="New clan name" value={renamedClan} onChange={(event) => setRenamedClan(event.target.value)} maxLength={30} className="clan-input min-w-0 flex-1 rounded-xl border px-3 py-2.5" /><button type="button" onClick={() => void renameClan()} disabled={renamedClan.trim().length < 2 || renamedClan.trim() === clan.name} className="clan-primary-button rounded-xl px-4 py-2.5 font-black disabled:opacity-45">Save clan name</button></div>}
            {clan.colorsUnlocked && <div className="mt-5"><label htmlFor="clan-theme" className="clan-text-muted mb-2 block text-sm font-bold">Clan color theme</label><select id="clan-theme" value={clan.theme} onChange={(event) => void upgradeClan("theme", event.target.value)} className="clan-input rounded-xl border px-4 py-3">{themeOptions.map((theme) => <option key={theme} value={theme}>{themeNames[theme]}</option>)}</select></div>}
            {clan.bannerUnlocked && <div className="mt-5"><label className="clan-text-muted mb-2 block text-sm font-bold">Clan banner · wide image visible to all members</label><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadClanBanner(file); event.currentTarget.value = ""; }} className="clan-input block max-w-full text-sm" /></div>}
          </section>
        </>
      )}

      {!clan && <section className="clan-panel rounded-3xl border p-6 text-center"><h2 className="text-2xl font-black">Find your people</h2><p className="clan-text-muted mt-2">Discover clans, browse their banners and themes, and request to join.</p><button type="button" onClick={() => setDiscoverOpen(true)} className="clan-primary-button mt-4 rounded-xl px-5 py-3 font-black"><Search className="mr-2 inline" size={18} />Discover clans</button></section>}

      {discoverOpen && <section className="clan-discover">
        <div className="clan-discover-head"><h2 className="page-sign text-4xl font-black">Discover Clans</h2></div>
        <label className="clan-discover-search"><Search size={20} aria-hidden="true" /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search clans..." aria-label="Search clans" /></label>
        <div className="clan-discover-grid">{clans.length ? clans.map((item) => {
          const pending = pendingByClan.has(item.id || "");
          const full = item.members >= item.memberCapacity;
          const ownClan = membershipClanId === item.id;
          const theme = item.colorsUnlocked ? item.theme : "breadlet";
          const canRequest = !(isGuest || ownClan || pending || full || Boolean(membershipClanId));
          const status = ownClan ? "Your clan" : pending ? "Request pending" : full ? "Clan full" : membershipClanId ? "" : isGuest ? "Sign in to join" : "Request to join";
          return <article key={item.id || item.name} className={`clan-discover-card clan-theme-${theme} ${item.animatedProfiles ? "clan-profile-animated" : ""}`}>
            <span className="clan-discover-art">
              {item.profileBlook ? <img src={clanBlookArt(item.profileBlook)} alt={`${item.profileBlook} clan profile`} /> : item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" /> : <Users size={44} aria-hidden="true" />}
            </span>
            <div className="clan-discover-info">
              <h3>{item.name}</h3>
              {item.ownerName && <p><Crown size={16} aria-hidden="true" />Owned by {item.ownerName}</p>}
              <p><Users size={16} aria-hidden="true" />{item.members}/{item.memberCapacity} members</p>
              <p><img src="/assets/Bread%20bucks.svg" alt="" aria-hidden="true" />{item.treasury.toLocaleString()}</p>
              <p className="clan-discover-description" title={item.description}>{item.description || "A Breadlet community."}</p>
              {status && <button type="button" disabled={!canRequest} onClick={() => void handleRequestClan(item)} className="clan-discover-join">{status}</button>}
            </div>
          </article>;
        }) : <p className="clan-text-muted col-span-full py-10 text-center">No clans match that search.</p>}</div>
      </section>}
    </div>
  );
}
function CraftingTab({
  player,
  salvage,
  massDismantle,
  craft,
  isGuest,
}: {
  player: Player;
  salvage: (name: string) => void;
  massDismantle: (quantities: Record<string, number>) => Promise<boolean>;
  craft: (material: string) => void;
  isGuest: boolean;
}) {
  const [search, setSearch] = useState("");
  const [showRecycleStation, setShowRecycleStation] = useState(false);
  const [massRecycleOpen, setMassRecycleOpen] = useState(false);
  const [recycleQuantities, setRecycleQuantities] = useState<Record<string, number>>({});
  const ownedCounts = player.inventory.reduce<Record<string, number>>((counts, name) => ({ ...counts, [name]: (counts[name] || 0) + 1 }), {});
  const recyclable = Object.entries(ownedCounts).filter(([, count]) => count > 1);
  const recycleTotals = recyclable.reduce<Record<string, number>>((totals, [name]) => {
    bundleEntries(dismantleBundleFor(name, rarityFor(name))).forEach(([material, amount]) => { totals[material] = (totals[material] || 0) + amount * (recycleQuantities[name] || 0); });
    return totals;
  }, {});
  const recycleCount = Object.values(recycleQuantities).reduce((sum, value) => sum + value, 0);
  const unique = player.inventory.filter(
    (name, index, items) => items.indexOf(name) === index,
  ).filter((name) => name.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="crafting-workspace">
      <div className="crafting-page-heading">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#bde8ff]">Forge and recycle</p>
          <h1 className="page-sign mt-1 text-4xl font-black">Crafting</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <button type="button" onClick={() => { setRecycleQuantities({}); setMassRecycleOpen(true); }} disabled={!recyclable.length} className="crafting-dark-button rounded-xl px-4 py-3 text-sm font-black disabled:opacity-50">
            Mass recycle
          </button>
          <button type="button" onClick={() => setShowRecycleStation(true)} className="crafting-dark-button rounded-xl px-4 py-3 text-sm font-black">
            Open Recycle Station
          </button>
        </div>
      </div>
      <div className="crafting-workbench mt-5 grid gap-5">
        <div className="crafting-assembly-panel">
          <h2 className="text-2xl font-black">Craftable Breadlets</h2>
          <div className="crafting-recipe-grid mt-5 grid gap-3 sm:grid-cols-2">
            {craftRecipes.map((recipe) => { const missing = bundleEntries(recipe.ingredients).reduce((sum, [material, amount]) => sum + Math.max(0, amount - (player.materials[material] || 0)), 0); const enough = isGuest || missing === 0; return <button key={recipe.name} onClick={() => craft(recipe.name)} title={`Craft ${recipe.name}`} aria-label={`Craft ${recipe.name}`} className={`craft-process group flex w-full items-center gap-3 rounded-2xl bg-[#24170f] p-3 text-left ${enough ? "craft-ready" : ""}`}><span className="flex min-h-12 min-w-12 shrink-0 items-center justify-center gap-0.5 rounded-xl bg-[#6c4328] p-1">{bundleEntries(recipe.ingredients).map(([material, amount]) => <span key={material} title={`${amount} ${material}`} className="relative"><img src={materialArtFor(material)} alt="" className="h-7 w-7 object-contain" /><b className="absolute -right-1 -top-1 rounded-full bg-[#e9bd67] px-1 text-[8px] text-[#29170c]">{amount}</b></span>)}</span><span className="h-px flex-1 bg-[#8e623c]" /><span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-[#d49a4a]/40 bg-[#3a2415]"><img src={artFor(recipe.name)} alt={recipe.name} className="h-14 w-14 object-contain" /></span><span className="min-w-0 flex-1"><strong className="block truncate">{recipe.name}</strong><small className={enough ? "text-[#e9bd67]" : "text-[#b58d68]"}>{isGuest ? "Free to craft" : enough ? "Ready to craft" : `Need ${missing} more material${missing === 1 ? "" : "s"}`}</small></span><span className={`text-2xl transition group-hover:translate-x-1 ${enough ? "text-[#ffe2a0]" : "text-[#8e623c]"}`}>→</span></button>; })}
          </div>
        </div>
      </div>
      {massRecycleOpen && (
        <div className="modal-layer fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 px-4 py-6 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-3xl border-4 border-[#CC5500] bg-[#FFD9B3] p-5 text-[#3B1F0E] shadow-2xl sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black">Mass recycle</h2>
                <p className="mt-1 text-sm">Recycle extra copies into materials. One of each Breadlet is always kept.</p>
              </div>
              <button type="button" onClick={() => setMassRecycleOpen(false)} aria-label="Close mass recycle" className="rounded-lg px-3 py-2 text-xl hover:bg-[#FFB066]">×</button>
            </div>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => setRecycleQuantities(Object.fromEntries(recyclable.map(([name, count]) => [name, count - 1])))} className="rounded-lg bg-[#CC5500] px-3 py-1.5 text-xs font-black text-white hover:bg-[#A94500]">Max all</button>
              <button type="button" onClick={() => setRecycleQuantities({})} className="rounded-lg border-2 border-[#CC5500] px-3 py-1.5 text-xs font-black hover:bg-[#FFB066]">Clear</button>
            </div>
            <div className="mt-3 space-y-2 overflow-y-auto pr-1">
              {recyclable.map(([name, count]) => (
                <div key={name} className="flex items-center gap-3 rounded-xl border-2 border-[#CC5500] bg-[#ED7117] p-2">
                  <BlookImg name={name} className="h-10 w-10" />
                  <span className="min-w-0 flex-1 truncate text-sm font-black">{name} <span className="font-bold">· {count - 1} extra</span></span>
                  <input type="number" min={0} max={count - 1} value={recycleQuantities[name] || 0} onChange={(event) => setRecycleQuantities((current) => ({ ...current, [name]: Math.min(count - 1, Math.max(0, Math.floor(Number(event.target.value) || 0))) }))} aria-label={`Recycle ${name}`} className="w-20 rounded-lg border-2 border-[#CC5500] bg-[#FFF0E0] px-2 py-1 text-right font-black text-[#3B1F0E]" />
                  <button type="button" onClick={() => setRecycleQuantities((current) => ({ ...current, [name]: count - 1 }))} className="rounded-lg bg-[#CC5500] px-2 py-1 text-xs font-black text-white">Max</button>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-[#FFF0E0] p-3">
              <span className="text-sm font-black">{recycleCount} Breadlets →</span>
              {Object.entries(recycleTotals).filter(([, amount]) => amount > 0).map(([material, amount]) => <span key={material} className="flex items-center gap-1 text-sm font-black"><img src={materialArtFor(material)} alt={material} className="h-6 w-6 object-contain" />{amount}</span>)}
            </div>
            <button type="button" disabled={!recycleCount} onClick={async () => { if (await massDismantle(recycleQuantities)) { setMassRecycleOpen(false); setRecycleQuantities({}); } }} className="mt-4 rounded-xl bg-[#CC5500] px-4 py-3 font-black text-white hover:bg-[#A94500] disabled:opacity-50">Recycle {recycleCount} Breadlets</button>
          </section>
        </div>
      )}
      {showRecycleStation && (
        <div className="modal-layer fixed inset-0 z-[9998] flex items-center justify-center bg-black/80 px-4 py-6 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="recycle-station-title" className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-3xl border-4 border-[#CC5500] bg-[#FFD9B3] p-5 text-[#3B1F0E] shadow-2xl sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#e9bd67]">Recycle station</p>
                <h2 id="recycle-station-title" className="mt-1 text-2xl font-black">Dismantle Breadlets</h2>
                <p className="mt-1 text-sm text-[#3B1F0E]">Choose a Breadlet to preview the returned materials.</p>
              </div>
              <button type="button" onClick={() => setShowRecycleStation(false)} aria-label="Close recycle station" className="rounded-lg px-3 py-2 text-xl text-[#3B1F0E] hover:bg-[#FFB066]">×</button>
            </div>
            <div className="mt-4 flex items-center gap-3 rounded-xl border-2 border-[#CC5500] bg-[#FFF0E0] px-3 py-2"><span className="text-[#CC5500]">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a Bread" className="min-w-0 flex-1 bg-transparent text-[#3B1F0E] outline-none" /></div>
            <div className="mt-4 grid grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
              {unique.map((name) => (
                <div key={name} className="dismantle-item rounded-2xl p-3">
                  <BlookImg name={name} className="mx-auto h-16 w-16" />
                  <span className="mt-1 block truncate text-center text-[10px] font-bold text-[#3B1F0E]">{name} · ×{player.inventory.filter((item) => item === name).length}</span>
                  <span className="mt-2 flex justify-center gap-1">{bundleEntries(dismantleBundleFor(name, rarityFor(name))).map(([material, amount]) => <span key={material} title={`${amount} ${material}`} className="relative"><img src={materialArtFor(material)} alt="" className="h-5 w-5 object-contain" /><b className="absolute -right-1 -top-1 rounded-full bg-[#e9bd67] px-1 text-[8px] text-[#29170c]">{amount}</b></span>)}</span>
                  <button type="button" disabled={player.inventory.length <= 1} onClick={() => { setShowRecycleStation(false); salvage(name); }} title={player.inventory.length <= 1 ? "Keep at least one Bread in your collection" : `Dismantle ${name}`} className="dismantle-item-action mt-3 w-full rounded-lg px-2 py-2 text-xs font-black disabled:cursor-not-allowed disabled:opacity-35">Dismantle</button>
                </div>
              ))}
            </div>
            {!unique.length && <p className="mt-6 text-center text-sm text-[#b58d68]">No Breadlets found.</p>}
          </section>
        </div>
      )}
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


export default function Game() {
  return <MainPage />;
}
