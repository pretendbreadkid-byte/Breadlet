export const ADMIN_USERNAME = 'breadblook';

// Admin access belongs only to the account named breadblook (case-insensitive); no other account qualifies.
export async function hasAdminAccess(database: any, userId: string): Promise<boolean> {
  const { data: profile } = await database.from('profiles').select('username').eq('id', userId).maybeSingle();
  return String(profile?.username || '').trim().toLowerCase() === ADMIN_USERNAME;
}
// Chat moderators can delete messages and time players out for 30 minutes.
export const MODERATOR_USERNAMES = ['xyl1x'];
// Limited moderators get the Moderator badge but can only time out LIMITED_MUTES_PER_DAY
// players a day (30 minutes each): no deleting messages and no AI log.
export const LIMITED_MODERATOR_USERNAMES = ['ethan32'];
export const LIMITED_MUTES_PER_DAY = 2;

export async function chatModerationRole(database: any, userId: string): Promise<'full' | 'limited' | null> {
  const { data: profile } = await database.from('profiles').select('username').eq('id', userId).maybeSingle();
  const name = String(profile?.username || '').trim().toLowerCase();
  if (name === ADMIN_USERNAME || MODERATOR_USERNAMES.includes(name)) return 'full';
  return LIMITED_MODERATOR_USERNAMES.includes(name) ? 'limited' : null;
}
// Artists who drew Breadlet art get the Artist badge (admins can also grant it to others).
export const ARTIST_USERNAMES = ['minti_icecreamet'];

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

// Names nobody may take, because they pass for the chat bot or for official staff. Matched
// even with swaps like "breadIet" or "adm1n". The long ones also match one typo away.
const RESERVED_NAMES = ['breadlet', 'breadletbot', 'breadletofficial', 'breadletadmin', 'admin', 'administrator', 'owner', 'moderator', 'mod', 'staff', 'support', 'system', 'official', 'bot'];

function isReservedName(name: string) {
  const key = lookalikeKey(name);
  return RESERVED_NAMES.some((reserved) => {
    const reservedKey = lookalikeKey(reserved);
    return key === reservedKey || (reservedKey.length >= 7 && withinOneEdit(key, reservedKey));
  });
}

// True for names made to look like a staff account or the Breadlet bot (impersonation).
export function isStaffLookalike(username: string) {
  const name = String(username || '').trim().toLowerCase();
  if (isReservedName(name)) return true;
  return [ADMIN_USERNAME, ...MODERATOR_USERNAMES, ...LIMITED_MODERATOR_USERNAMES].some((staff) => name !== staff && withinOneEdit(lookalikeKey(name), lookalikeKey(staff)));
}

// Staff badges are tied to usernames, so they can't be granted or removed by editing stats.
export function moderatorBadges(username?: string | null): string[] {
  const name = String(username || '').trim().toLowerCase();
  if (name === ADMIN_USERNAME) return ['Owner'];
  return [...(MODERATOR_USERNAMES.includes(name) || LIMITED_MODERATOR_USERNAMES.includes(name) ? ['Moderator'] : []),...(ARTIST_USERNAMES.includes(name) ? ['Artist'] : [])];
}
