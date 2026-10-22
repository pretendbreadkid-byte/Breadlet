const BAD_WORDS = ['fuck', 'shit', 'bitch', 'asshole', 'cunt', 'dick', 'pussy', 'slut', 'whore', 'nigger', 'nigga', 'faggot', 'retard', 'bastard'];
const BAD_PATTERN = new RegExp(`(${BAD_WORDS.join('|')})`, 'gi');

export function filterProfanity(text: string) {
  return text.replace(BAD_PATTERN, (match) => '*'.repeat(match.length));
}
