import { filterProfanity } from './chat-filter';

const SYSTEM_PROMPT = 'You are Breadlet, the friendly bot in the chat of Breadlet, a collectible game where players open packs, collect Breadlets, trade, craft, join clans and use Bread Bucks. Answer any question helpfully in 1-2 short sentences with a few emojis. Only mention Breadlet when relevant. Keep it family-friendly and politely refuse rude requests.';

// Instant answers for common game questions: no network call, so no lag.
const faq: { match: RegExp; answer: string }[] = [
  { match: /^(hi|hello|hey|sup|yo)\b/i, answer: '👋 Hey there, crumb! Ask me anything.' },
  { match: /\b(pack|bag|open)\b/i, answer: '📦 Spend Bread Bucks on packs in the Packs tab to open Breadlets. Rarer ones are harder to pull!' },
  { match: /\b(bread ?bucks?|tokens?|claim)\b/i, answer: '💰 Claim 100-1500 Bread Bucks every hour, win some in chat games, or sell Breadlets in the Bazaar.' },
  { match: /\b(trade|trading)\b/i, answer: '🤝 Both players must be online. Open a trade room, add Breadlets and Bread Bucks, chat, then both confirm. A 20% fee applies to Bread Bucks.' },
  { match: /\b(bazaar|market|sell)\b/i, answer: '🛒 List Breadlets in the Bazaar. You can take your listings down any time in My Listings.' },
  { match: /\b(craft|crafting|material|recycle)\b/i, answer: '🔨 Recycle extra Breadlets into materials, then use the Crafting tab to make new ones.' },
  { match: /\bclans?\b/i, answer: '🛡️ Clans let you team up, donate to a treasury, upgrade your banner and climb the clan leaderboard.' },
  { match: /\b(refer|referral|invite)\b/i, answer: '🎁 Share your code from Resources > Refer a Friend. 500 Bread Bucks per signup, Verified badge at 25 and a custom code at 50!' },
  { match: /\b(coin ?flip|word ?race|unscramble|games?)\b/i, answer: '🎮 Tap the Games button for Coin Flip, Word Race and Unscramble. Use /accept to join a flip and /cancel to cancel yours.' },
];

export function instantAnswer(question: string): string | null {
  return faq.find((entry) => entry.match.test(question))?.answer || null;
}

const cache = new Map<string, { text: string; at: number }>();
const CACHE_MS = 10 * 60 * 1000;
let lastFreeCall = 0;

// Fast path: cached/instant answers return immediately. Otherwise one short model call (max 20s).
// Configure a fast provider with AI_API_KEY (for example a free Groq key); without one, the free
// Pollinations endpoint is used, which only allows 1 reply per 30s for the whole server.
export async function answerQuestion(question: string): Promise<string> {
  const q = filterProfanity(question).trim().slice(0, 300);
  if (!q) return '🤖 Ask me something after /ai, like /ai how do I trade?';
  if (q.includes('*')) return '😇 Let us keep it crumb-clean, friend!';

  const key = q.toLowerCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.text;
  const quick = instantAnswer(q);
  if (quick) return quick;

  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) {
    if (Date.now() - lastFreeCall < 30000) return '⏳ I am a bit busy right now, ask me again in a few seconds!';
    lastFreeCall = Date.now();
  }
  const url = process.env.AI_API_URL
    || (!apiKey ? 'https://text.pollinations.ai/openai' : apiKey.startsWith('gsk_') ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions');
  const model = process.env.AI_MODEL
    || (!apiKey ? 'openai-fast' : apiKey.startsWith('gsk_') ? 'llama-3.1-8b-instant' : 'gpt-4o-mini');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify({ model, max_tokens: 100, temperature: 0.7, messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: q }] }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return '⏳ I am a bit busy right now, ask me again in a few seconds!';
    const data = await response.json();
    const text = filterProfanity(String(data?.choices?.[0]?.message?.content || '').trim()).slice(0, 400);
    if (!text) return '🤔 I could not think of an answer, try asking another way!';
    cache.set(key, { text, at: Date.now() });
    if (cache.size > 200) cache.delete(cache.keys().next().value as string);
    return text;
  } catch {
    return '🤔 I took too long thinking, try again!';
  }
}
