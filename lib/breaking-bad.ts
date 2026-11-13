// Breadlet Breaks Bad, the upcoming event. Its Breadlets exist (migration 0087) so admins can
// give them out, but nothing drops them yet.
export const BREAKING_BAD_BREADLETS = [
  { name: "Heisenberg Sketch", art: "/assets/breaking-bad/heisenberg-sketch.png" },
  { name: "Methylamine", art: "/assets/breaking-bad/methylamine.png" },
  { name: "Gus Fring", art: "/assets/breaking-bad/gus-fring.svg" },
  { name: "Flask", art: "/assets/breaking-bad/flask-2.svg" },
  { name: "Mike", art: "/assets/breaking-bad/mike.svg" },
  { name: "Battle Scarred Mike", art: "/assets/breaking-bad/battle-scarred-mike.svg" },
];

export const BREAKING_BAD_BADGE = { name: "Breadlet Breaks Bad", art: "/assets/breaking-bad/badge.svg" };

export const BREAKING_BAD_NAMES = BREAKING_BAD_BREADLETS.map((breadlet) => breadlet.name);

// Battle pass PREVIEW ONLY: shown greyed out in the event tab, nothing can be earned yet.
// Cook a batch once an hour for crystals; each tier needs more crystals and pays more.
export const CRYSTAL_ART = ["/assets/breaking-bad/crystal-1.svg", "/assets/breaking-bad/crystal-2.svg", "/assets/breaking-bad/crystal-3.svg"];

export type BattlePassTier = { tier: number; crystals: number; tokens: number; breadlet?: string; badge?: boolean };
export const BATTLE_PASS_TIERS: BattlePassTier[] = [
  { tier: 1, crystals: 3, tokens: 100 },
  { tier: 2, crystals: 8, tokens: 200, breadlet: "Methylamine" },
  { tier: 3, crystals: 14, tokens: 350 },
  { tier: 4, crystals: 22, tokens: 500, breadlet: "Flask" },
  { tier: 5, crystals: 32, tokens: 750 },
  { tier: 6, crystals: 44, tokens: 1000, breadlet: "Heisenberg Sketch" },
  { tier: 7, crystals: 58, tokens: 1500 },
  { tier: 8, crystals: 74, tokens: 2000, breadlet: "Mike" },
  { tier: 9, crystals: 92, tokens: 3000 },
  { tier: 10, crystals: 112, tokens: 4000, breadlet: "Gus Fring" },
  { tier: 11, crystals: 135, tokens: 6000 },
  { tier: 12, crystals: 160, tokens: 10000, breadlet: "Battle Scarred Mike", badge: true },
];
