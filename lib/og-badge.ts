// OG is for the original players: accounts created before this moment (2026-10-24, 48 hours back).
// It used to be handed to everyone on the client, so new players got it too.
export const OG_CUTOFF = '2026-10-22T02:46:42Z';

export const ogBadges = (createdAt?: string | null): string[] => {
  const created = Date.parse(String(createdAt || ''));
  return Number.isFinite(created) && created < Date.parse(OG_CUTOFF) ? ['OG'] : [];
};

// Birthday badge: players give their birthday (month and day only, no year) when they sign up or in
// Settings, saved as stats.birthday "MM-DD". On that day (US Central time) they show the Birthday badge.
export const cleanBirthday = (value: unknown): string | null => {
  const match = /^(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const daysIn = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return daysIn && day >= 1 && day <= daysIn ? `${match[1]}-${match[2]}` : null;
};
export const birthdayBadges = (stats: any, now = new Date()): string[] => {
  const birthday = cleanBirthday(stats?.birthday);
  if (!birthday) return [];
  const today = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: '2-digit', day: '2-digit' }).format(now).replace('/', '-');
  return today === birthday ? ['Birthday'] : [];
};
