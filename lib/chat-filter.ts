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
  return !MILD_WORDS.some((mild) => squashed.includes(mild));
}
