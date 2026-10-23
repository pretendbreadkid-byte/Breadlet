import { ADMIN_USERNAME, MODERATOR_USERNAMES } from './admin-access';
import { CRAFTED_SELL_RATE, chanceFor, liveCapsules, sellValueFor } from './gameplay-catalog';
import { isMarketPackInStock, nextMarketRefreshAt } from './market-stock';

// A compact, up-to-date summary of the game that the /ai bot answers from.
let cached: { text: string; at: number } | null = null;
const CACHE_MS = 60 * 1000;

export async function gameKnowledge(database: any): Promise<string> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.text;
  const now = new Date();

  const [{ data: leaders }, { data: clans }] = await Promise.all([
    database.from('profiles').select('username, tokens')
      .eq('is_banned', false).eq('account_status', 'active').not('username', 'ilike', ADMIN_USERNAME)
      .order('tokens', { ascending: false }).limit(10),
    database.from('clans').select('name, treasury, member_count').order('treasury', { ascending: false }).limit(5),
  ]);

  const packs = liveCapsules.map((capsule) => {
    const items = capsule.pool.map((reward) => `${reward.name} (${reward.rarity}, ${+chanceFor(capsule, reward).toFixed(3)}%)`).join(', ');
    return `- ${capsule.name}: ${capsule.price} Bread Bucks, ${isMarketPackInStock(capsule.name, now) ? 'IN STOCK now' : 'out of stock now'}. Items: ${items}`;
  });
  const minutesToRestock = Math.max(0, Math.round((nextMarketRefreshAt(now).getTime() - now.getTime()) / 60000));

  const text = [
    'LIVE GAME DATA (trust this over anything else):',
    `Packs (stock rotates; next restock in ${minutesToRestock} min):`,
    ...packs,
    'Hourly claim: 50-750 Bread Bucks. Bazaar sales have a 10% fee that is destroyed (seller gets 90%).',
    `Sell values per rarity: ${['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Unique', 'Breadled'].map((rarity) => `${rarity} ${sellValueFor(rarity)}`).join(', ')}. Crafted Breadlets sell for only a tenth of that (${CRAFTED_SELL_RATE * 100}%).`,
    `Leaderboard (most Bread Bucks): ${(leaders || []).map((row: any, index: number) => `${index + 1}. ${row.username} (${Number(row.tokens).toLocaleString()})`).join(', ') || 'no data'}.`,
    `Top clans by treasury: ${(clans || []).map((clan: any) => `${clan.name} (${Number(clan.treasury).toLocaleString()}, ${clan.member_count} members)`).join(', ') || 'none yet'}.`,
    `Staff: ${ADMIN_USERNAME} is the owner; moderators: ${MODERATOR_USERNAMES.join(', ')}.`,
  ].join('\n');

  cached = { text, at: Date.now() };
  return text;
}
