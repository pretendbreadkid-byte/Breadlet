// Blocked players live in profiles.stats.blockedPlayers as [{ id, username }] (Settings and the
// profile Block button). A block works both ways: neither player can friend, trade with, visit the
// garden of or give crops to the other, and the blocker stops seeing the other's chat messages.
export type BlockedPlayer = { id: string; username: string };

export const blockedIds = (stats: any): string[] =>
  Array.isArray(stats?.blockedPlayers) ? stats.blockedPlayers.map((entry: any) => String(entry?.id || '')).filter(Boolean) : [];

export async function isBlockedBetween(database: any, first: string, second: string) {
  const { data } = await database.from('profiles').select('id, stats').in('id', [first, second]);
  const rows = (data || []) as { id: string; stats: any }[];
  return rows.some((row) => blockedIds(row.stats).includes(row.id === first ? second : first));
}

export const BLOCKED_MESSAGE = "You can't do that with this player.";
