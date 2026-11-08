import { networkIdentity } from './network-identity';

// A custom ban screen for one player (a Star Wars style crawl, app/components/ban-crawl.tsx).
// Set by an admin in SQL as profiles.stats.banScreen = { title, crimes: [...] } on each of their
// accounts. It shows when those accounts log in or load the game, and on any device they used.
export type BanScreen = { title: string; crimes: string[] };

export function banScreenFrom(stats: any): BanScreen | null {
  const screen = stats?.banScreen;
  if (!screen || typeof screen.title !== 'string' || !Array.isArray(screen.crimes)) return null;
  const crimes = screen.crimes.filter((crime: unknown) => typeof crime === 'string' && crime.trim()).map((crime: string) => crime.slice(0, 200)).slice(0, 30);
  return crimes.length ? { title: screen.title.slice(0, 80), crimes } : null;
}

export async function banScreenFor(admin: any, profileId: string) {
  const { data } = await admin.from('profiles').select('is_banned, stats').eq('id', profileId).maybeSingle();
  return data?.is_banned ? banScreenFrom(data.stats) : null;
}

// The ban screen for a device banned because of a player who has one. Only device bans count: an IP
// can be shared (school Wi-Fi), and other people there shouldn't see someone else's crimes.
export async function deviceBanScreen(admin: any, request: Request) {
  const { deviceHash } = networkIdentity(request);
  if (!deviceHash) return null;
  const { data: bans } = await admin.from('network_bans').select('profile_id, expires_at').eq('kind', 'device').eq('value_hash', deviceHash);
  const ids = (bans || []).filter((ban: any) => !ban.expires_at || Date.parse(ban.expires_at) > Date.now()).map((ban: any) => ban.profile_id);
  if (!ids.length) return null;
  const { data: profiles } = await admin.from('profiles').select('stats').in('id', ids);
  for (const profile of profiles || []) {
    const screen = banScreenFrom(profile.stats);
    if (screen) return screen;
  }
  return null;
}
