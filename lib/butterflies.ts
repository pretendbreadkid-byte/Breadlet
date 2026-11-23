// Butterfly Catching, the Garden's second mini-game. The server rolls each round (which butterflies
// fly and when), so a player can only be paid for butterflies that were really in their round and
// had already flown in when they finished. Pays up to BUTTERFLY_DAILY_LIMIT Bread Bucks a day.

export const BUTTERFLY_DAILY_LIMIT = 1500;
// How long a round lasts, and how long each butterfly takes to cross the meadow.
export const ROUND_MS = 40_000;
export const FLIGHT_MS = 6_500;
export const BUTTERFLIES_PER_ROUND = 16;
// A little slack for the network when finishing a round.
export const FINISH_GRACE_MS = 15_000;

export type ButterflyKind = 'Orange' | 'Blue' | 'Golden';
export const BUTTERFLY_KINDS: { kind: ButterflyKind; value: number; chance: number }[] = [
  { kind: 'Orange', value: 6, chance: 0.6 },
  { kind: 'Blue', value: 10, chance: 0.3 },
  { kind: 'Golden', value: 25, chance: 0.1 },
];
export const butterflyValue = (kind: ButterflyKind) => BUTTERFLY_KINDS.find((entry) => entry.kind === kind)?.value || 0;

// One butterfly in a round: when it appears (ms after the round starts), where it enters (0-1 down
// the meadow), which way it flies and how much it wobbles.
export type RoundButterfly = { id: string; kind: ButterflyKind; at: number; y: number; dir: 1 | -1; wave: number };
export type ButterflyRound = { id: string; startedAt: number; butterflies: RoundButterfly[] };
export type ButterflyState = { day: string; amount: number; round?: ButterflyRound };

export const butterflyDay = (time = Date.now()) => new Date(time).toISOString().slice(0, 10);

export function rollRound(random: () => number, now = Date.now()): ButterflyRound {
  const butterflies: RoundButterfly[] = [];
  const spacing = (ROUND_MS - FLIGHT_MS) / BUTTERFLIES_PER_ROUND;
  for (let index = 0; index < BUTTERFLIES_PER_ROUND; index += 1) {
    const roll = random();
    let total = 0;
    const kind = BUTTERFLY_KINDS.find((entry) => (total += entry.chance) > roll)?.kind || 'Orange';
    butterflies.push({
      id: `${index}-${Math.floor(random() * 1e9).toString(36)}`,
      kind,
      at: Math.round(index * spacing + random() * spacing * 0.6),
      y: Math.round((0.12 + random() * 0.7) * 100) / 100,
      dir: random() < 0.5 ? 1 : -1,
      wave: Math.round((0.5 + random()) * 100) / 100,
    });
  }
  return { id: `${now.toString(36)}${Math.floor(random() * 1e9).toString(36)}`, startedAt: now, butterflies };
}

export function normalizeButterflies(raw: any): ButterflyState {
  const day = typeof raw?.day === 'string' ? raw.day : '';
  const amount = Math.max(0, Math.floor(Number(raw?.amount) || 0));
  const round = raw?.round && typeof raw.round.id === 'string' && Number.isFinite(raw.round.startedAt) && Array.isArray(raw.round.butterflies)
    ? {
      id: raw.round.id.slice(0, 40),
      startedAt: raw.round.startedAt,
      butterflies: raw.round.butterflies.slice(0, BUTTERFLIES_PER_ROUND).filter((b: any) => b && typeof b.id === 'string' && BUTTERFLY_KINDS.some((entry) => entry.kind === b.kind)),
    }
    : undefined;
  return { day, amount, ...(round ? { round } : {}) };
}

export const butterfliesEarnedToday = (state: ButterflyState) => (state.day === butterflyDay() ? state.amount : 0);
