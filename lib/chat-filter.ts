// Text is normalized before matching so leetspeak, accents, look-alike letters,
// spacing and repeated letters ("n 1 i i g g @") can't sneak past the filter.

const ZERO_WIDTH = /[\u00AD\u200B-\u200F\u2060-\u2064\uFEFF]/g;
const COMBINING_MARKS = /[\u0300-\u036F\u1AB0-\u1AFF\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]/g;

const LOOKALIKES: Record<string, string> = {
  '0': 'o', '1': 'i', '!': 'i', '|': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's',
  '7': 't', '+': 't', '9': 'g', '6': 'g', '8': 'b',
  // Cyrillic / Greek letters that look Latin.
  'а': 'a', 'е': 'e', 'ё': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x', 'у': 'y', 'і': 'i', 'ї': 'i',
  'к': 'k', 'м': 'm', 'н': 'h', 'т': 't', 'в': 'b', 'п': 'n', 'г': 'r', 'ԁ': 'd', 'ո': 'n',
  'α': 'a', 'ε': 'e', 'ι': 'i', 'ο': 'o', 'κ': 'k', 'τ': 't', 'ν': 'v', 'η': 'n', 'ρ': 'p', 'ı': 'i', 'ɡ': 'g',
};

function normalize(text: string) {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(ZERO_WIDTH, '')
    .replace(/./g, (char) => LOOKALIKES[char] ?? char);
}

// Letters only: "N!-g g@" -> "nigga".
const letters = (text: string) => normalize(text).replace(/[^a-z]/g, '');
// Letters only with repeats collapsed: "fa66ott" -> "fagot".
const squash = (text: string) => letters(text).replace(/(.)\1+/g, '$1');

// Matched on letters(); the double g keeps "minigame" and "Nigel" safe.
const NWORD = /n+[iy]+(?:[gq]{2,}(?:e+r|a+|u+h|u+r|l+e+t)|b{2,}a+)/;
// Matched on squash().
const SLUR_ROOTS = /fag[oei]t|retard|trany|tranies|wetback|kilyourself/;
// Short slurs only blocked as a whole word, so "spicy" or "Nigeria" stay fine.
const SLUR_WORDS = /^(?:fags?|fagy|spics?|kikes?|chinks?|beaners?|kys|dykes?|nigas?|nigers?)$/;

const MILD_WORDS = ['fuck', 'shit', 'bitch', 'asshole', 'cunt', 'dick', 'pussy', 'slut', 'whore', 'bastard'].map(squash);

function slurAt(text: string, atStart: boolean) {
  const hit = (index: number) => (atStart ? index === 0 : index >= 0);
  return hit(letters(text).search(NWORD)) || hit(squash(text).search(SLUR_ROOTS));
}

const wordHasSlur = (word: string) => SLUR_WORDS.test(squash(word)) || slurAt(word, false);

export function hasSevereSlur(text: string) {
  const words = text.split(/\s+/).filter(Boolean);
  // Joining the following words catches "n i g g a" without flagging "mini game",
  // because a joined match has to begin at the start of a word.
  return words.some((word, index) => wordHasSlur(word) || slurAt(words.slice(index, index + 8).join(''), true));
}

// Automatic bans require a whole-word match; the broader display filter remains separate.
export function hasBannableSlur(text: string) {
  const words = text.split(/\s+/).filter(Boolean);
  const exact = (word: string) => {
    const raw = letters(word);
    const collapsed = raw.replace(/(.)\1+/g, '$1');
    return /^(?:n+[iy]+[gq]{2,}(?:e+r|a+|u+h|u+r)|n+[iy]+b{2,}a+)s?$/.test(raw)
      || /^(?:fag[oei]t|fag|fagy|trany|tranies|wetback|spic|kike|chink|beaner|dyke|retard)s?$/.test(collapsed);
  };
  return words.some((word, index) => {
    const trimmed = word.replace(/^[^a-z0-9\u00c0-\uFFFF]+|[^a-z0-9\u00c0-\uFFFF]+$/gi, '');
    if (exact(word) || exact(trimmed) || (normalize(trimmed).match(/[a-z]+/g) || []).some(exact)) return true;
    let joined = '';
    for (let i = index; i < words.length && i < index + 10; i += 1) {
      const part = letters(words[i]);
      if (part.length !== 1) break;
      joined += part;
      if (exact(joined)) return true;
    }
    return false;
  });
}

// Masks any word containing profanity or a slur.
export function filterProfanity(text: string) {
  return text.replace(/\S+/g, (word) => {
    const squashed = squash(word);
    return wordHasSlur(word) || MILD_WORDS.some((mild) => squashed.includes(mild)) ? '*'.repeat(word.length) : word;
  });
}

// Names have no spaces to hide behind, so slurs and swears count anywhere inside them.
export function isNameAllowed(name: string) {
  const squashed = squash(name);
  if (hasSevereSlur(name) || /fag|kys|^nig(?:a|er)|nig(?:a|er)s?$/.test(squashed)) return false;
  if (hasLink(name) || hasSexualContent(name) || SEXUAL_NAME.test(letters(name))) return false;
  return !MILD_WORDS.some((mild) => squashed.includes(mild));
}

// Copying the chat window and pasting it back in brings the message times along with it.
export function isPastedChatLog(text: string) {
  return (text.match(/\b\d{1,2}:\d{2}\b/g) || []).length >= 3;
}

// Links: "https://", "www.", "discord.gg/abc", "site . com", "site dot com", "site(dot)com".
const TLDS = 'com|net|org|gg|io|xyz|ly|me|tv|co|app|dev|link|site|online|us|uk|ru|cc|info|biz|gl|to|be|sh|lol|fun|club|live|store|shop|vip|top|pro|ai|ca|de|fr|in|tk|ml|ga|cf|gq|ws|pw|mx|onion|edu|gov';
const LINK = new RegExp(String.raw`(?:https?\s*:\s*/\s*/|\bwww\s*\.\s*[a-z0-9]|\b[a-z0-9-]+\s*(?:\.|\(\s*dot\s*\)|\[\s*dot\s*\]|\s+dot\s+)\s*(?:${TLDS})\b)`, 'i');
// Why a message can't be posted at all: links (except from staff) and sexual content.
export function blockedContentError(text: string, allowLinks = false) {
  if (!allowLinks && hasLink(text)) return "Links aren't allowed in chat.";
  if (hasSexualContent(text)) return 'That message was blocked: sexual content is not allowed.';
  return '';
}

export function hasLink(text: string) {
  const plain = text.normalize('NFKC').replace(ZERO_WIDTH, '').replace(/[。｡]/g, '.');
  return LINK.test(plain);
}

// Sexual content. Whole words for short ones ("sex", "cum", "rape") so "Sussex", "cucumber" and
// "grape" stay fine; longer roots count anywhere in a word.
const SEXUAL_WORDS = /^(?:sex|sexy|sexi|sexes|sexual|sexualy|sexting|secks|seks|cum|cums|cuming|tits|titties|xxx|nsfw|rape|raped|raping|rapist|nudes?|horny|boobs?|boobies|penis|vagina|anal|dildo|milf|thot|pedo|pedos|pedophile)$/;
const SEXUAL_ROOTS = /porn|hentai|onlyfans|masturbat|blowjob|handjob|orgasm|erotic|horny|nudes|boobies|titties|penis|vagina|dildo|sexting|sexual|molest|pedophil|rule34|nsfw/;
// Inside usernames (no spaces): roots plus a few that are only safe to check without word edges.
const SEXUAL_NAME = /porn|hentai|onlyfans|masturbat|blowjob|handjob|orgasm|erotic|horny|nudes|boobs|titties|penis|vagina|dildo|sexy|sexting|sexual|molest|pedophil|rule34|nsfw|^sex|(?<!s)sex$|xxx|rapist|milf/;
export function hasSexualContent(text: string) {
  const words = text.split(/\s+/).filter(Boolean);
  const wordHit = (word: string) => {
    const raw = letters(word);
    return SEXUAL_WORDS.test(raw) || SEXUAL_WORDS.test(raw.replace(/(.)\1+/g, '$1')) || SEXUAL_ROOTS.test(raw);
  };
  if (words.some(wordHit)) return true;
  // Spelled out with spaces: "s e x".
  for (let start = 0; start < words.length; start += 1) {
    let joined = '';
    for (let i = start; i < words.length && i < start + 12; i += 1) {
      const part = letters(words[i]);
      if (part.length !== 1) break;
      joined += part;
      if (joined.length > 1 && wordHit(joined)) return true;
    }
  }
  return false;
}
