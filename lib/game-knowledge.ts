import { ADMIN_USERNAME, MODERATOR_USERNAMES } from './admin-access';
import { CHAT_COMMANDS } from './chat-commands';
import { FIESTA_SHOP, LEAVES_PER_SHOWER, SHOWER_MINUTES, showerAt } from './fall-fiesta';
import { DAILY_EARN_LIMIT, SEEDS } from './fields';
import { CRAFTED_SELL_RATE, POWER_HOUR_LUCK, chanceFor, craftRecipes, liveCapsules, powerHourAt, sellValueFor, wheelRewards } from './gameplay-catalog';
import { limitedItemsOnSale } from './limited-shop';
import { isMarketPackInStock, isSeasonalPackLocked, marketPackStock, nextMarketRefreshAt, seasonalPackOpensAt } from './market-stock';

const minutesUntil = (time: number, now: number) => Math.max(0, Math.round((time - now) / 60000));

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
  const nowMs = now.getTime();
  const power = powerHourAt(nowMs);
  const shower = showerAt(nowMs);
  const stockChances = marketPackStock.map(({ name, chance }) => `${name} ${Math.round(chance * 100)}%`).join(', ');
  const seasonal = Object.entries(seasonalPackOpensAt).map(([name, at]) => `${name} ${isSeasonalPackLocked(name, now) ? `opens ${at.slice(0, 10)} (shown in the shop early, can't be opened yet)` : 'is open and always in stock'}`).join('; ');
  const limited = limitedItemsOnSale(nowMs).map((item) => `${item.name} for ${item.price} Bread Bucks until ${item.endsAt.slice(0, 10)}`).join(', ');

  const text = [
    'LIVE GAME DATA (trust this over anything else):',
    `Packs (stock rotates; next restock in ${minutesToRestock} min):`,
    ...packs,
    `Each hour every bag rolls whether it is in Ted's Shop; chance to be in stock per hour: ${stockChances}. At least 4 bags are always in stock. Admins can force a bag into stock with /stock.`,
    `Seasonal bags: ${seasonal}.`,
    `Limited shop (buy the Breadlet itself, no roll): ${limited || 'nothing on sale right now'}.`,
    `Power Hour: ${POWER_HOUR_LUCK}x luck on Legendary and rarer pulls for 1 hour every 3 hours (UTC 02:30, 05:30, 08:30...). ${power.live && nowMs >= power.startsAt ? `It is ON now for ${minutesUntil(power.endsAt, nowMs)} more min.` : `Next one in ${minutesUntil(power.nextAt > nowMs && nowMs >= power.endsAt ? power.nextAt : power.startsAt, nowMs)} min.`}`,
    `Fall Fiesta event: a leaf shower falls for ${SHOWER_MINUTES} minutes at the top of every hour (catch up to ${LEAVES_PER_SHOWER} leaves). ${shower.live ? 'A shower is falling right now!' : `Next shower in ${minutesUntil(shower.nextAt, nowMs)} min.`} Leaf shop: ${FIESTA_SHOP.map((item) => `${item.name}${item.badge ? ' badge' : ''} ${item.price} leaves`).join(', ')}.`,
    `Hourly claim: spin the wheel once an hour for ${wheelRewards.map((reward) => `${reward.label} (${reward.chance}%)`).join(', ')}.`,
    'Bazaar sales have a 10% fee that is destroyed (seller gets 90%). Ted and Walter White can never be sold or traded.',
    `Crafting: recycle extra Breadlets into materials (Cloth, Sugar, Flower, Metal; Gold and Gem only come from the wheel), then craft: ${craftRecipes.map((recipe) => `${recipe.name} = ${Object.entries(recipe.ingredients).map(([material, amount]) => `${amount} ${material}`).join(' + ')}`).join('; ')}.`,
    `Breadlet Garden: still being tested, only the owner can play it right now. Buy seeds at Ted's Seed Stand, plant them in 9 beds, harvest when grown: ${SEEDS.map((seed) => `${seed.name} seed costs ${seed.cost}, grows in ${seed.growMs / 60000} min, sells for about ${seed.payout}`).join('; ')}. Every grown crop gets a random size (0.6x to 2x) and bigger ones sell for more. Picked crops go to your basket (key 6 or B): sell one or sell all, or hold one in the hand slot and hover a player to give it to them. Each harvest has a small chance to drop that Breadlet too. Max ${DAILY_EARN_LIMIT} Bread Bucks a day from gardens.`,
    `Chat commands anyone can use: ${CHAT_COMMANDS.filter((command) => command.role === 'everyone').map((command) => `${command.usage} (${command.description})`).join(', ')}.`,
    'Tabs: Event, Goodybags (Ted shop, open bags), Breadlets (your collection), Crafting, Clans, Bazaar (player market), Chat, Leaderboard. Guests cannot use Clans, Bazaar, Chat or the Leaderboard. Kid mode turns off chat, trading and outside links.',
    `Sell values per rarity: ${['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Secret', 'Unique', 'Breadled'].map((rarity) => `${rarity} ${sellValueFor(rarity)}`).join(', ')}. Crafted Breadlets sell for only a tenth of that (${CRAFTED_SELL_RATE * 100}%).`,
    `Leaderboard (most Bread Bucks): ${(leaders || []).map((row: any, index: number) => `${index + 1}. ${row.username} (${Number(row.tokens).toLocaleString()})`).join(', ') || 'no data'}.`,
    `Top clans by treasury: ${(clans || []).map((clan: any) => `${clan.name} (${Number(clan.treasury).toLocaleString()}, ${clan.member_count} members)`).join(', ') || 'none yet'}.`,
    `Staff: ${ADMIN_USERNAME} is the owner; moderators: ${MODERATOR_USERNAMES.join(', ')}.`,
  ].join('\n');

  cached = { text, at: Date.now() };
  return text;
}
