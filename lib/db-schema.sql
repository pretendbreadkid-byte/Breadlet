-- Breadlet database foundation
-- PostgreSQL / Supabase-ready schema

CREATE TABLE profiles (
  id UUID PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  tokens INTEGER NOT NULL DEFAULT 0 CHECK (tokens >= 0),
  luck INTEGER NOT NULL DEFAULT 0,
  equipped_blook_id UUID,
  daily_reward_streak INTEGER NOT NULL DEFAULT 0,
  last_daily_reward_at TIMESTAMPTZ,
  is_banned BOOLEAN NOT NULL DEFAULT FALSE,
  ban_reason TEXT,
  ban_expires_at TIMESTAMPTZ,
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  mine_progress JSONB NOT NULL DEFAULT '{}'::jsonb,
  account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'banned', 'restricted'))
);

CREATE TABLE blooks (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  rarity TEXT NOT NULL CHECK (rarity IN ('Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Chroma', 'Unique', 'Transcendent')),
  retired BOOLEAN NOT NULL DEFAULT FALSE,
  shiny_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  artwork_key TEXT,
  description TEXT,
  custom_animation_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE inventory (
  id UUID PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blook_id UUID NOT NULL REFERENCES blooks(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  shiny BOOLEAN NOT NULL DEFAULT FALSE,
  retired BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE(profile_id, blook_id)
);

CREATE TABLE chests (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  price INTEGER NOT NULL CHECK (price >= 0),
  description TEXT,
  pool JSONB NOT NULL,
  rarity TEXT,
  is_limited BOOLEAN NOT NULL DEFAULT FALSE,
  limited_until TIMESTAMPTZ,
  is_retired BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE chest_rolls (
  id UUID PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  chest_id UUID NOT NULL REFERENCES chests(id) ON DELETE RESTRICT,
  roll_seed TEXT,
  reward_blook_id UUID REFERENCES blooks(id),
  reward_rarity TEXT,
  tokens_spent INTEGER NOT NULL CHECK (tokens_spent >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE token_transactions (
  id UUID PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('mine', 'daily_reward', 'spin', 'promo', 'gift', 'event', 'chest', 'marketplace', 'trade', 'sell')),
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE marketplace_listings (
  id UUID PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blook_id UUID NOT NULL REFERENCES blooks(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price INTEGER NOT NULL CHECK (price >= 0 AND price <= 100000),
  status TEXT NOT NULL CHECK (status IN ('active', 'sold', 'cancelled', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sold_at TIMESTAMPTZ
);

CREATE TABLE trades (
  id UUID PRIMARY KEY,
  sender_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  receiver_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sender_offer_json JSONB NOT NULL,
  receiver_offer_json JSONB NOT NULL,
  sender_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  receiver_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE friends (
  id UUID PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  friend_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(profile_id, friend_profile_id)
);

CREATE TABLE clans (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  clan_image_url TEXT,
  owner_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  member_count INTEGER NOT NULL DEFAULT 1 CHECK (member_count >= 1 AND member_count <= 25)
);

CREATE TABLE clan_members (
  id UUID PRIMARY KEY,
  clan_id UUID NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('leader', 'admin', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  token_contributions INTEGER NOT NULL DEFAULT 0,
  UNIQUE(clan_id, profile_id)
);

CREATE TABLE clan_chat_messages (
  id UUID PRIMARY KEY,
  clan_id UUID NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  reply_to_message_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE global_chat_messages (
  id UUID PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  reply_to_message_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE daily_rewards (
  id UUID PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reward_amount INTEGER NOT NULL CHECK (reward_amount >= 0),
  streak_count INTEGER NOT NULL DEFAULT 0,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(profile_id, claimed_at)
);

CREATE TABLE spins (
  id UUID PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reward_type TEXT NOT NULL,
  reward_value INTEGER NOT NULL DEFAULT 0,
  rolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(profile_id, rolled_at)
);

CREATE TABLE mine_progress (
  id UUID PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  current_earnings_today INTEGER NOT NULL DEFAULT 0 CHECK (current_earnings_today >= 0),
  remaining_daily_limit INTEGER NOT NULL DEFAULT 2500 CHECK (remaining_daily_limit >= 0),
  pickaxe_level INTEGER NOT NULL DEFAULT 1 CHECK (pickaxe_level >= 1),
  total_tokens_mined INTEGER NOT NULL DEFAULT 0 CHECK (total_tokens_mined >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(profile_id)
);

CREATE TABLE promo_codes (
  id UUID PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  reward_type TEXT NOT NULL CHECK (reward_type IN ('tokens', 'blook', 'luck')),
  reward_value INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMPTZ,
  max_uses INTEGER,
  per_player_limit INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE promo_code_usage (
  id UUID PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  promo_code_id UUID NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
  used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(profile_id, promo_code_id)
);

CREATE TABLE events (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  points_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE event_progress (
  id UUID PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  points INTEGER NOT NULL DEFAULT 0,
  boxes_opened INTEGER NOT NULL DEFAULT 0,
  quests JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(profile_id, event_id)
);

CREATE TABLE announcements (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  image_url TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE gifts (
  id UUID PRIMARY KEY,
  sender_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  receiver_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('tokens', 'blook')),
  item_id UUID,
  quantity INTEGER NOT NULL DEFAULT 1,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE bans (
  id UUID PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  is_permanent BOOLEAN NOT NULL DEFAULT FALSE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_by_admin_id UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE appeals (
  id UUID PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'declined')),
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

CREATE TABLE admin_roles (
  id UUID PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'moderator')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(profile_id, role)
);

CREATE TABLE migration_records (
  id UUID PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  migration_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('UNCLAIMED', 'CLAIMED', 'COMPLETED', 'REVOKED')),
  encoded_payload TEXT NOT NULL,
  security_signature TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
