// OG is for the original players: accounts created before this moment (2026-10-24, 48 hours back).
// It used to be handed to everyone on the client, so new players got it too.
export const OG_CUTOFF = '2026-10-22T02:46:42Z';

export const ogBadges = (createdAt?: string | null): string[] => {
  const created = Date.parse(String(createdAt || ''));
  return Number.isFinite(created) && created < Date.parse(OG_CUTOFF) ? ['OG'] : [];
};
