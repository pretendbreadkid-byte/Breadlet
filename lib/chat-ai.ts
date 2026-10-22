import { filterProfanity, hasSevereSlur } from './chat-filter';

const SYSTEM_PROMPT = 'You are Breadlet, the friendly bot in the chat of Breadlet, a collectible game where players open packs, collect Breadlets, trade, craft, join clans and use Bread Bucks. Answer any question helpfully in 1-3 short sentences with a few emojis. For questions about the game (packs, odds, items, stock, leaderboard, clans, staff) answer from the live game data below and never make up items or numbers. Only mention Breadlet when relevant. Keep it family-friendly and politely refuse rude requests.';

// Instant answers for common game questions: no network call, so no lag.
const faq: { match: RegExp; answer: string }[] = [
  { match: /^(hi|hello|hey|sup|yo)\b/i, answer: '👋 Hey there, crumb! Ask me anything.' },
  { match: /\b(pack|bag|open)\b/i, answer: '📦 Spend Bread Bucks on packs in the Packs tab to open Breadlets. Rarer ones are harder to pull!' },
  { match: /\b(bread ?bucks?|tokens?|claim)\b/i, answer: '💰 Claim 50-750 Bread Bucks every hour, win some in chat games, or sell Breadlets in the Bazaar (10% fee).' },
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

// One chat-completion call to the configured provider. Returns null when the provider refuses.
// With waitForSlot, a "free limit, retry after Ns" reply (the free endpoint allows one reply per
// 30s for the whole server) waits for the slot and tries once more instead of giving up.
export async function callAiModel(options: { system: string; user: string; maxTokens: number; temperature: number; waitForSlot?: boolean }): Promise<string | null> {
  const apiKey = process.env.AI_API_KEY;
  const url = process.env.AI_API_URL
    || (!apiKey ? 'https://text.pollinations.ai/openai' : apiKey.startsWith('gsk_') ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions');
  const model = process.env.AI_MODEL
    || (!apiKey ? 'openai-fast' : apiKey.startsWith('gsk_') ? 'llama-3.1-8b-instant' : 'gpt-4o-mini');
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
    body: JSON.stringify({ model, max_tokens: options.maxTokens, temperature: options.temperature, messages: [{ role: 'system', content: options.system }, { role: 'user', content: options.user }] }),
    signal: AbortSignal.timeout(20000),
  });
  if ((response.status === 402 || response.status === 429) && options.waitForSlot) {
    const body = await response.text().catch(() => '');
    const retrySeconds = Number(response.headers.get('retry-after')) || Number(body.match(/retry after (\d+)\s*s/i)?.[1]) || 30;
    if (retrySeconds > 30) return null;
    await new Promise((resolve) => setTimeout(resolve, (retrySeconds + 1) * 1000));
    return callAiModel({ ...options, waitForSlot: false });
  }
  if (!response.ok) return null;
  const data = await response.json();
  return String(data?.choices?.[0]?.message?.content || '').trim();
}

const cache = new Map<string, { text: string; at: number }>();
// Short cache: answers can depend on live data like the leaderboard.
const CACHE_MS = 60 * 1000;

// Fast path: cached/instant answers return immediately. Otherwise one short model call.
// Configure a fast provider with AI_API_KEY (for example a free Groq key); without one, the free
// Pollinations endpoint is used, which only allows 1 reply per 30s for the whole server.
export async function answerQuestion(question: string, knowledge = ''): Promise<string> {
  const q = filterProfanity(question).trim().slice(0, 300);
  if (!q) return '🤖 Ask me something after /ai, like /ai how do I trade?';
  if (q.includes('*')) return '😇 Let us keep it crumb-clean, friend!';

  const key = q.toLowerCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.text;
  // Greetings answer instantly; other canned answers are only a fallback when the model is busy,
  // so real questions get answers from the live game data.
  const quick = instantAnswer(q);
  if (quick && /^(hi|hello|hey|sup|yo)\b/i.test(q)) return quick;
  const busy = quick || '⏳ I am a bit busy right now, ask me again in a few seconds!';

  try {
    const raw = await callAiModel({ system: knowledge ? `${SYSTEM_PROMPT}\n\n${knowledge}` : SYSTEM_PROMPT, user: q, maxTokens: 160, temperature: 0.4, waitForSlot: true });
    if (raw === null) return busy;
    if (hasSevereSlur(raw)) return '😇 Let us keep it crumb-clean, friend!';
    const text = filterProfanity(raw).slice(0, 400);
    if (!text) return '🤔 I could not think of an answer, try asking another way!';
    cache.set(key, { text, at: Date.now() });
    if (cache.size > 200) cache.delete(cache.keys().next().value as string);
    return text;
  } catch {
    return quick || '🤔 I took too long thinking, try again!';
  }
}
