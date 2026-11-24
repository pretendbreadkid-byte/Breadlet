// The Breadlet bot answers a few common chat messages on its own (no /ai needed).
// Each reply waits COOLDOWN_MS before it can be sent again, so the bot doesn't flood chat.
const COOLDOWN_MS = 2 * 60_000;

const REPLIES: { id: string; matches: RegExp[]; reply: string }[] = [
  {
    // "chat is dead", "nobody's online", "so inactive"...
    id: 'dead-chat',
    matches: [
      /\b(chat|it'?s|its|this|so|game)\b[^.!?]{0,20}\b(dead|inactive|empty|quiet)\b/i,
      /\bdead\s+(chat|game|server)\b/i,
      /\b(no ?one|nobody)('?s| is)?\s+(here|on|online|talking|active)\b/i,
    ],
    reply: "If there aren't many people online, you're playing at a late time. Come back from 5pm-7pm for the best chatting experience!",
  },
  {
    // "I'm broke", "can someone give me tokens", "pls give blooks"...
    id: 'begging',
    matches: [
      /\b(i'?m|im|i am|so|super|really)\s+(so\s+)?(broke|poor)\b/i,
      /\b(give|gimme|donate|send)\s+(me\s+)?(some\s+|any\s+|a\s+|free\s+)?(tokens?|bread\s?bucks|bucks|blooks?|breadlets?|money|coins?)\b/i,
      /\b(can|could)\s+(i|someone|anyone|u|you)\s+(have|get|give)\b[^.!?]{0,25}\b(tokens?|bread\s?bucks|blooks?|breadlets?|money)\b/i,
      /\b(pls|plz|please)\b[^.!?]{0,25}\b(tokens?|bread\s?bucks|blooks?|breadlets?)\b/i,
    ],
    reply: "Womp womp.. Please don't beg! If you're not sure how to claim your hourly tokens, go to your profile and click Claim Tokens near your name.",
  },
];

const lastSent = new Map<string, number>();

// The bot's reply to this message, or null. Counts as sent (starts the cooldown) when it returns one.
export function autoReplyFor(message: string, now = Date.now()) {
  const text = message.trim();
  if (!text || text.startsWith('/')) return null;
  for (const rule of REPLIES) {
    if (!rule.matches.some((pattern) => pattern.test(text))) continue;
    if (now - (lastSent.get(rule.id) || 0) < COOLDOWN_MS) return null;
    lastSent.set(rule.id, now);
    return rule.reply;
  }
  return null;
}
