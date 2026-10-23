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

// Folds characters people swap in to fake a name ("breadbIook", "breadb1ook", "bread_blook")
// and collapses repeats, so lookalikes compare equal.
const lookalikeKey = (name: string) => name.trim().toLowerCase()
  .replace(/[_\s.-]/g, '')
  .replace(/[1i|!]/g, 'l')
  .replace(/0/g, 'o')
  .replace(/3/g, 'e')
  .replace(/5/g, 's')
  .replace(/(.)\1+/g, '$1');

// Letters that differ between two strings, allowing one insert/delete/swap ("bradblook").
function withinOneEdit(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i += 1; j += 1; continue; }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else { i += 1; j += 1; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

// True for names made to look like a staff account but that aren't it (impersonation).
export function isStaffLookalike(username: string) {
  const name = String(username || '').trim().toLowerCase();
  return [ADMIN_USERNAME, ...MODERATOR_USERNAMES].some((staff) => name !== staff && withinOneEdit(lookalikeKey(name), lookalikeKey(staff)));
}

// Staff badges are tied to usernames, so they can't be granted or removed by editing stats.
export function moderatorBadges(username?: string | null): string[] {
  const name = String(username || '').trim().toLowerCase();
  if (name === ADMIN_USERNAME) return ['Owner'];
  return MODERATOR_USERNAMES.includes(name) ? ['Moderator'] : [];
}
