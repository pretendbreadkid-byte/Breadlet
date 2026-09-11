export type Rarity =
  | 'Common'
  | 'Uncommon'
  | 'Rare'
  | 'Epic'
  | 'Legendary'
  | 'Mythic'
  | 'Chroma'
  | 'Unique'
  | 'Transcendent';

export type RetiredStatus = 'active' | 'retired';

export type Blook = {
  id: string;
  name: string;
  rarity: Rarity;
  isRetired: boolean;
  isShinyEligible: boolean;
  artworkKey?: string;
  description?: string;
  mythicSpecialTag?: string;
};

export type PlayerProfile = {
  id: string;
  username: string;
  createdAt: string;
  tokens: number;
  luck: number;
  equippedBlookId?: string;
  stats: Record<string, number>;
  dailyRewardStreak: number;
  lastDailyRewardAt?: string;
  mineProgress: {
    currentEarningsToday: number;
    remainingDailyLimit: number;
    pickaxeLevel: number;
    totalTokensMined: number;
    lastMineAt?: string;
  };
  isBanned: boolean;
  banReason?: string;
  banExpiresAt?: string;
};

export type ChestDefinition = {
  id: string;
  name: string;
  price: number;
  description: string;
  pool: string[];
  rarity: Rarity | 'Limited';
  limitedUntil?: string;
  isRetired: boolean;
  active: boolean;
};

export type InventoryEntry = {
  playerId: string;
  blookId: string;
  quantity: number;
  isShiny: boolean;
  isRetired: boolean;
};

export type ServerTransaction = {
  id: string;
  playerId: string;
  type: 'tokens' | 'chest' | 'marketplace' | 'trade' | 'promo' | 'gift' | 'event';
  delta: number;
  reason: string;
  createdAt: string;
};
