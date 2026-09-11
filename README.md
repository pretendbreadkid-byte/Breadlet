# Breadlet

Breadlet is a real online collectible game architecture built around persistent player progress, a token economy, chest openings, inventory management, trading, social systems, and future public deployment.

## Stack

- Next.js
- TypeScript
- Tailwind CSS
- Supabase-ready PostgreSQL schema

## Core principles

- The server is the source of truth.
- Tokens, chest rewards, marketplace actions, and admin permissions must be validated server-side.
- Account data, inventory, daily rewards, mine progress, and bans persist across sessions and devices.
- The system is organized into reusable modules and database-backed services.

## Included foundation

- Landing page and technical docs app shell
- Rarity and chest configuration
- Shared game type definitions
- Full database schema for the Breadlet ecosystem
- Validation guards for token and inventory integrity rules

## Supabase setup

The app now uses Supabase Auth and database APIs when the public environment variables are configured. Without them, the existing browser-local prototype fallback remains available.

1. Create a project at [supabaggse.com](https://supabase.com) and open its SQL Editor.
2. Run `lib/db-schema.sql` once to create the Breadlet tables.
3. Run `supabase/migrations/0001_breadlet_backend.sql` after that. It connects profiles to `auth.users`, enables RLS, creates the starter Blook bootstrap, and enables Realtime for global chat.
4. In Supabase Auth settings, choose your email confirmation policy. For quick local testing, disable email confirmation; for real deployment, keep it enabled and configure SMTP.
5. Copy `.env.example` to `.env.local` and fill in the project URL and anon key from Supabase Project Settings > API:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

6. Run `npm run build` and `npm run start`, then create two accounts using different email addresses in two browsers.

The current server-backed slice includes Supabase Auth, profile bootstrap, RLS, starter inventory, player API, player search, friend requests, and Realtime global chat. The visual game remains intact and falls back to the old local prototype when `.env.local` is absent.

## Production security boundary

Valuable actions still need to move behind server-side transactional functions before launch: chest rolls, mining, daily rewards, spins, gifts, trades, marketplace settlement, crafting, and admin actions. The schema and RLS are the foundation, but the client must not be trusted to submit token balances or inventory results.

## Next steps

1. Integrate the provided visual assets and references.
2. Finalize the UI styling to match those assets.
3. Configure Supabase using the steps above.
4. Build chest opening, inventory, mine, Bazaar, and trading modules.
5. Expand into clans, chat, events, moderation, admin, and migration systems.
