const sections = [
  {
    title: 'Architecture goals',
    bullets: [
      'Use Next.js and TypeScript for a maintainable public-game frontend.',
      'Separate UI, domain logic, services, and database contracts into focused modules.',
      'Treat the server as the source of truth for inventory, token balances, and chest odds.',
    ],
  },
  {
    title: 'Database schema',
    bullets: [
      'players: profile, auth, tokens, luck, equipped blook, daily status, account creation date, ban state.',
      'blooks: canonical metadata, rarity, retired flag, shiny eligibility, custom animation support, artwork references.',
      'player_inventory: player_id, blook_id, quantity, shiny, retired_at, last_updated_at.',
      'chests: chest_id, name, price, rarity, availability, active flag, limited window, reward pool metadata.',
      'chest_rolls: transaction log with user, chest_id, reward, server-derived odds, timestamp, and validity markers.',
      'marketplace_listings: seller_id, blook_id, quantity, price, status, created_at, sold_at.',
      'trades: offerers, token values, blook offers, confirmations, state, audit records.',
      'clans, clan_members, clan_chat, friends, notifications, promo_codes, promo_code_usage, events, announcements, bans, appeals, admin_roles, migration_records.',
    ],
  },
  {
    title: 'Security requirements',
    bullets: [
      'Never trust token balances or chest outcomes from the browser.',
      'Verify auth, ownership, and balances on every sensitive action.',
      'Use server-side checks for duplicate rewards, negative balances, double-purchases, and admin roles.',
      'Implement rate limiting, moderation rules, and immutable transaction logs.',
    ],
  },
  {
    title: 'Feature roadmap',
    bullets: [
      'Phase 1: auth, profiles, tokens, chest system, inventory, mine, daily rewards, spin wheel.',
      'Phase 2: Bazaar, trading, friends, public profiles, clans, chat, notifications.',
      'Phase 3: shop, promo codes, events, announcements, admin and moderation.',
      'Phase 4: migration, bans/appeals, polish, and public deployment.',
    ],
  },
];

export default function DocsPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-4xl font-black tracking-tight text-white">Breadlet technical plan</h1>
        <p className="mt-4 max-w-3xl text-slate-300">
          This project is organized to support a true online collectible game with persistent progress, fair server-side validation,
          and a scalable database shape for future expansion.
        </p>

        <div className="mt-10 space-y-8">
          {sections.map((section) => (
            <section key={section.title} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-soft">
              <h2 className="text-xl font-bold text-white">{section.title}</h2>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-300">
                {section.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
