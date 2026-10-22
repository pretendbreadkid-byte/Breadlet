export const ADMIN_USERNAME = 'breadblook';

// Admin access belongs only to the account named breadblook (case-insensitive); no other account qualifies.
export async function hasAdminAccess(database: any, userId: string): Promise<boolean> {
  const { data: profile } = await database.from('profiles').select('username').eq('id', userId).maybeSingle();
  return String(profile?.username || '').trim().toLowerCase() === ADMIN_USERNAME;
}
// Chat moderators can delete messages and time players out for 30 minutes.
export const MODERATOR_USERNAMES = ['ethan32'];

export async function isChatModerator(database: any, userId: string): Promise<boolean> {
  const { data: profile } = await database.from('profiles').select('username').eq('id', userId).maybeSingle();
  const name = String(profile?.username || '').trim().toLowerCase();
  return name === ADMIN_USERNAME || MODERATOR_USERNAMES.includes(name);
}

export function isProtectedFromMute(username: string) {
  const name = String(username || '').trim().toLowerCase();
  return name === ADMIN_USERNAME || MODERATOR_USERNAMES.includes(name);
}

export function moderatorBadges(username?: string | null): string[] {
  return MODERATOR_USERNAMES.includes(String(username || '').toLowerCase()) ? ['Moderator'] : [];
}
