// Evil AI mode: while it's on for a player (or for everyone), the /ai bot answers them rudely.
// A player's timer lives in profiles.stats.evilAiUntil; the global one in app_settings.evil_ai_until.

export const EVIL_AI_MINUTES = 30;
export const MAX_GLOBAL_EVIL_MINUTES = 24 * 60;

const isFuture = (value: unknown) => {
  const until = Date.parse(String(value || ''));
  return Number.isFinite(until) && until > Date.now();
};

export const isEvilActive = (stats: any) => isFuture(stats?.evilAiUntil);

export const evilUntil = (minutes = EVIL_AI_MINUTES) => new Date(Date.now() + minutes * 60 * 1000).toISOString();

// Returns null before migration 0059 adds the column, so evil mode simply stays off.
export async function globalEvilUntil(database: any): Promise<string | null> {
  const { data, error } = await database.from('app_settings').select('evil_ai_until').eq('id', 1).maybeSingle();
  if (error || !isFuture(data?.evil_ai_until)) return null;
  return data.evil_ai_until;
}

export async function isEvilFor(database: any, profileId: string): Promise<boolean> {
  const [{ data: profile }, global] = await Promise.all([
    database.from('profiles').select('stats').eq('id', profileId).maybeSingle(),
    globalEvilUntil(database),
  ]);
  return Boolean(global) || isEvilActive(profile?.stats);
}
