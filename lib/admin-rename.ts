import { isNameAllowed } from './chat-filter';
import { ADMIN_USERNAME, ARTIST_USERNAMES, LIMITED_MODERATOR_USERNAMES, MODERATOR_USERNAMES, isStaffLookalike } from './admin-access';

// Staff powers and some badges are tied to these usernames, so they can't be renamed (a freed
// staff name could otherwise be taken by someone else).
export const NAME_LOCKED = [ADMIN_USERNAME, ...MODERATOR_USERNAMES, ...LIMITED_MODERATOR_USERNAMES, ...ARTIST_USERNAMES];

// An admin renames a player (admin panel or /rename in chat). Same name rules as Settings >
// Account, without the weekly wait. Players log in with their username, so they're told the new one.
export async function adminRenamePlayer(admin: any, targetId: string, nextName: string): Promise<{ ok: true; from: string; to: string } | { error: string; status: number }> {
  const username = nextName.trim();
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return { error: 'Use 3-20 letters, numbers or underscores.', status: 400 };
  if (isStaffLookalike(username) || NAME_LOCKED.includes(username.toLowerCase()) || ['admin', 'adminxd2'].includes(username.toLowerCase()) || !isNameAllowed(username)) {
    return { error: 'That username is not allowed.', status: 400 };
  }
  const { data: profile } = await admin.from('profiles').select('id, username, stats').eq('id', targetId).maybeSingle();
  if (!profile) return { error: 'Player not found.', status: 404 };
  if (NAME_LOCKED.includes(String(profile.username).toLowerCase())) return { error: 'Staff and artist usernames can\'t be changed.', status: 403 };
  if (profile.username === username) return { error: `${username} already has that name.`, status: 400 };
  const { data: taken } = await admin.from('profiles').select('id').ilike('username', username).neq('id', targetId).limit(1).maybeSingle();
  if (taken) return { error: 'That username is already taken.', status: 409 };
  const { error } = await admin.from('profiles')
    .update({ username, stats: { ...(profile.stats || {}), previousUsername: profile.username, renamedByAdminAt: new Date().toISOString() } })
    .eq('id', targetId);
  if (error) return { error: error.code === '23505' ? 'That username is already taken.' : error.message, status: 400 };
  const { data: authUser } = await admin.auth.admin.getUserById(targetId);
  await admin.auth.admin.updateUserById(targetId, { user_metadata: { ...(authUser?.user?.user_metadata || {}), username } });
  await admin.from('notifications').insert({
    profile_id: targetId,
    type: 'admin_gift',
    payload: { title: 'Your username was changed', message: `An admin changed your username from ${profile.username} to ${username}. Log in with ${username} from now on.` },
  });
  return { ok: true, from: profile.username, to: username };
}
