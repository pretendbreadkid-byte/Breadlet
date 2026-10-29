// Games tab: roulette, slots and dice for Bread Bucks. Outcomes are rolled on the server
// (app/api/casino), which passes in crypto randomness; this file holds the rules and payouts so the client
// and server agree. Every game returns a little under the bet on average.

export const CASINO_MIN_BET = 1;
export const CASINO_MAX_BET = 100000;

export type CasinoGame = 'roulette' | 'slots' | 'dice';

// European roulette: 0 is green, 1-36 alternate red and black.
export const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
export type RouletteBet = 'red' | 'black' | 'odd' | 'even' | 'low' | 'high' | `number:${number}`;

export function rouletteColor(n: number) {
  return n === 0 ? 'green' : RED_NUMBERS.includes(n) ? 'red' : 'black';
}

// Total returned (bet included) per Bread Buck bet when the pick wins.
export function roulettePayout(pick: string, n: number) {
  if (pick.startsWith('number:')) return Number(pick.slice(7)) === n ? 36 : 0;
  if (n === 0) return 0;
  if (pick === 'red' || pick === 'black') return rouletteColor(n) === pick ? 2 : 0;
  if (pick === 'odd') return n % 2 === 1 ? 2 : 0;
  if (pick === 'even') return n % 2 === 0 ? 2 : 0;
  if (pick === 'low') return n <= 18 ? 2 : 0;
  if (pick === 'high') return n >= 19 ? 2 : 0;
  return 0;
}

export function validRoulettePick(pick: string) {
  if (['red', 'black', 'odd', 'even', 'low', 'high'].includes(pick)) return true;
  const match = /^number:(\d{1,2})$/.exec(pick);
  return Boolean(match && Number(match[1]) <= 36);
}

// Slots: three reels. Weights are out of 100 per reel.
export const SLOT_SYMBOLS = [
  { id: 'bread', label: 'Bread', art: '/assets/bread-capsule.svg', weight: 34, three: 6, two: 0.5 },
  { id: 'acorn', label: 'Acorn', art: '/assets/fall/acorn.svg', weight: 26, three: 10, two: 1 },
  { id: 'leaf', label: 'Leaf', art: '/assets/fall/fall-leaf.webp', weight: 20, three: 18, two: 2 },
  { id: 'hat', label: 'Pilgrim Hat', art: '/assets/fall/pilgrim-hat.webp', weight: 13, three: 50, two: 3 },
  { id: 'bucks', label: 'Bread Bucks', art: '/assets/Bread%20bucks.svg', weight: 7, three: 150, two: 5 },
] as const;
export type SlotSymbol = (typeof SLOT_SYMBOLS)[number]['id'];

// Pays on three of a kind, or on the first two reels matching (about 94% back on average).
export function slotsPayout(reels: SlotSymbol[]) {
  const symbol = SLOT_SYMBOLS.find((entry) => entry.id === reels[0]);
  if (!symbol) return 0;
  if (reels[0] === reels[1] && reels[1] === reels[2]) return symbol.three;
  if (reels[0] === reels[1]) return symbol.two;
  return 0;
}

// Dice: two dice. Low (2-6) and High (8-12) pay 2x, Seven pays 5x.
export type DicePick = 'low' | 'seven' | 'high';
export function dicePayout(pick: DicePick, total: number) {
  if (pick === 'seven') return total === 7 ? 5 : 0;
  if (pick === 'low') return total <= 6 ? 2 : 0;
  return total >= 8 ? 2 : 0;
}

// rand(n) returns a whole number from 0 to n - 1.
export type Rand = (n: number) => number;

function spinReel(rand: Rand): SlotSymbol {
  let roll = rand(100);
  for (const symbol of SLOT_SYMBOLS) {
    if (roll < symbol.weight) return symbol.id;
    roll -= symbol.weight;
  }
  return SLOT_SYMBOLS[0].id;
}

export type CasinoResult =
  | { game: 'roulette'; number: number; color: string; multiplier: number }
  | { game: 'slots'; reels: SlotSymbol[]; multiplier: number }
  | { game: 'dice'; dice: [number, number]; total: number; multiplier: number };

export function playCasino(game: CasinoGame, pick: string, rand: Rand): CasinoResult | null {
  if (game === 'roulette') {
    if (!validRoulettePick(pick)) return null;
    const number = rand(37);
    return { game, number, color: rouletteColor(number), multiplier: roulettePayout(pick, number) };
  }
  if (game === 'slots') {
    const reels = [spinReel(rand), spinReel(rand), spinReel(rand)];
    return { game, reels, multiplier: slotsPayout(reels) };
  }
  if (game === 'dice') {
    if (!['low', 'seven', 'high'].includes(pick)) return null;
    const dice: [number, number] = [rand(6) + 1, rand(6) + 1];
    const total = dice[0] + dice[1];
    return { game, dice, total, multiplier: dicePayout(pick as DicePick, total) };
  }
  return null;
}
