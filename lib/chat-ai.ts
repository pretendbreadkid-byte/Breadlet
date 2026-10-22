const BAD_WORDS = ['fuck', 'shit', 'bitch', 'asshole', 'cunt', 'dick', 'pussy', 'slut', 'whore', 'nigger', 'nigga', 'faggot', 'retard', 'bastard'];
const BAD_PATTERN = new RegExp(`(${BAD_WORDS.join('|')})`, 'gi');

export function filterProfanity(text: string) {
  return text.replace(BAD_PATTERN, (match) => '*'.repeat(match.length));
}

const jokes = [
  'Why did the Breadlet cross the road? To get to the other slice!',
  'I tried to make a bread joke, but it was a little stale.',
  'Opening packs is my cardio.',
  'Knead a hint? You are already on a roll!',
  'My love life is like a loaf: crusty on the outside, soft in the middle.',
];

const topics: { match: RegExp; answer: string }[] = [
  { match: /breadblook/i, answer: '🍞👑 Breadblook is the legendary creator of Breadlet and keeper of the Bread Bucks bank. Absolute legend!' },
  { match: /(what|who|about).*breadlet|breadlet.*(game|about|is)\b/i, answer: '🥖✨ Breadlet is a great game where you open packs, collect Breadlets, trade, craft, join clans and climb the leaderboards. Come for the bread, stay for the fun!' },
  { match: /pack|open|crate/i, answer: '📦 Spend Bread Bucks on packs in the Packs tab to open Breadlets. Rarer ones are harder to pull, so keep rolling! 🎲' },
  { match: /bread ?buck|token|money|currency|claim/i, answer: '💰 Bread Bucks are the currency. Claim 100-1500 every hour, win some in chat games, or sell Breadlets in the Bazaar.' },
  { match: /trade|trading/i, answer: '🤝 Both players need to be online. Open the trade room, add Breadlets and Bread Bucks, chat, and both confirm. A 20% fee applies to Bread Bucks.' },
  { match: /bazaar|market|sell/i, answer: '🛒 The Bazaar is where you list Breadlets for sale. You can take listings down any time in My Listings.' },
  { match: /craft|material|recycle/i, answer: '🔨 Recycle extra Breadlets into materials, then use the Crafting tab to make new ones.' },
  { match: /clan/i, answer: '🛡️ Clans let you team up, donate to a treasury, upgrade your banner, and climb the clan leaderboard.' },
  { match: /game|coin ?flip|word ?race|unscramble|cancel/i, answer: '🎮 Hit the Games button for Coin Flip, Word Race and Unscramble. Use /accept to join a coin flip and /cancel to cancel your own game.' },
  { match: /badge|og/i, answer: '🏅 Badges show next to your name. The OG badge is only for original players, and there are Bread Bucks badges too.' },
  { match: /hello|hi\b|hey|sup/i, answer: '👋 Hey there, crumb! Ask me anything about Breadlet.' },
  { match: /joke|funny/i, answer: '' },
];

export function aiAnswer(question: string) {
  const joke = jokes[Math.floor(Math.random() * jokes.length)];
  const q = filterProfanity(question).trim();
  if (!q) return '🤖 Ask me something after /ai, like /ai how do I trade?';
  if (q.includes('*')) return '😇 Let us keep it crumb-clean, friend. Breadlet is a cozy place!';
  const topic = topics.find((entry) => entry.match.test(q));
  const askedForJoke = /joke|funny/i.test(q);
  if (!topic) return `🤔 I am not sure about that one. Try asking about packs, trading, the Bazaar or clans!`;
  const withJoke = askedForJoke || Math.random() < 0.2;
  return `${topic.answer}${withJoke ? ` 😄 ${joke}` : ''}`.trim();
}
const SYSTEM_PROMPT = 'You are Breadlet, the friendly bot in the chat of Breadlet, a collectible game where players open packs, collect Breadlets, trade, craft, join clans and use Bread Bucks. Answer any question helpfully in 1-3 short sentences with a few emojis. Only mention Breadlet or its creator Breadblook when relevant or asked. Only add a joke occasionally. Keep it family-friendly and refuse rude or unsafe requests politely.';

// Uses any OpenAI-compatible API when AI_API_KEY is set; otherwise falls back to the built-in answers.
export async function smartAnswer(question: string) {
  const q = filterProfanity(question).trim();
  const key = process.env.AI_API_KEY;
  if (!key || !q || q.includes('*')) return aiAnswer(question);
  try {
    const response = await fetch(process.env.AI_API_URL || 'https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'gpt-4o-mini',
        max_tokens: 200,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: q.slice(0, 300) }],
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return aiAnswer(question);
    const data = await response.json();
    const text = String(data?.choices?.[0]?.message?.content || '').trim();
    return text ? filterProfanity(text).slice(0, 480) : aiAnswer(question);
  } catch {
    return aiAnswer(question);
  }
}
