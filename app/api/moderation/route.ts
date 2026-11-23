import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';
import { ADMIN_USERNAME, BAN_MODERATOR_USERNAMES, isProtectedFromMute } from '../../../lib/admin-access';
import { KILL_MUTE_SECONDS, banPlayer, mutePlayer } from '../../../lib/moderation';

export const dynamic = 'force-dynamic';

// Profile moderation for the admin and ban moderators (lib/admin-access.ts BAN_MODERATOR_USERNAMES):
// GET ?targetId= -> their ban / mute status.
// POST { action: 'mute', targetId, minutes } (0 unmutes) | { action: 'ban', targetId, reason, hours, ipBan }
//      | { action: 'kill', targetId } (a WASTED screen for them and a 30 second mute).
async function staff() {
  const supabase = await createClient();
  const database = createAdminClient();
  if (!supabase || !database) return { response: NextResponse.json({ error: 'Moderation is unavailable.' }, { status: 503 }) };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { response: NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }) };
  const { data: me } = await database.from('profiles').select('username').eq('id', user.id).maybeSingle();
  const name = String(me?.username || '').trim().toLowerCase();
  if (name !== ADMIN_USERNAME && !BAN_MODERATOR_USERNAMES.includes(name)) return { response: NextResponse.json({ error: 'Only staff can do that.' }, { status: 403 }) };
  return { database, userId: user.id, username: String(me?.username), isAdmin: name === ADMIN_USERNAME };
}
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function GET(request: Request) {
  const session = await staff();
  if ('response' in session) return session.response;
  const targetId = new URL(request.url).searchParams.get('targetId') || '';
  const { data: target } = await session.database.from('profiles').select('username, is_banned, ban_reason, ban_expires_at, stats').eq('id', targetId).maybeSingle();
  if (!target) return fail('Player not found.', 404);
  const muted = typeof target.stats?.chatMutedUntil === 'string' && Date.parse(target.stats.chatMutedUntil) > Date.now() ? target.stats.chatMutedUntil : null;
  return NextResponse.json({ isBanned: Boolean(target.is_banned), banReason: target.ban_reason, banExpiresAt: target.ban_expires_at, mutedUntil: muted, protected: isProtectedFromMute(target.username) });
}

export async function POST(request: Request) {
  const session = await staff();
  if ('response' in session) return session.response;
  const { database, userId, username, isAdmin } = session;
  const body = await request.json().catch(() => ({}));
  const targetId = String(body.targetId || '');
  if (!targetId || targetId === userId) return fail('Choose another player.');
  const { data: target } = await database.from('profiles').select('username').eq('id', targetId).maybeSingle();
  if (!target) return fail('Player not found.', 404);
  const targetName = String(target.username || '').trim().toLowerCase();
  // Nobody can touch the owner; ban moderators can't touch other staff.
  if (targetName === ADMIN_USERNAME || (!isAdmin && isProtectedFromMute(target.username))) return fail(`${target.username} is staff.`, 403);

  if (body.action === 'mute') {
    const minutes = Math.floor(Number(body.minutes));
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 60 * 24 * 30) return fail('Pick a mute length.');
    const result = await mutePlayer(database, targetId, minutes * 60);
    if ('error' in result) return fail(result.error!, 500);
    return NextResponse.json({ ok: true, until: result.until, message: minutes ? `${target.username} is muted.` : `${target.username} can chat again.` });
  }

  if (body.action === 'ban') {
    const reason = String(body.reason || '').trim().slice(0, 500);
    const hours = Math.floor(Number(body.hours) || 0);
    if (!reason) return fail('Give a reason for the ban.');
    if (hours < 0 || hours > 8760) return fail('Pick a ban length.');
    const result = await banPlayer(database, targetId, userId, reason, hours, Boolean(body.ipBan));
    if ('error' in result) return fail(result.error!, 500);
    return NextResponse.json({ ok: true, message: `${target.username} is banned ${hours ? `for ${hours} hours` : 'forever'}${body.ipBan ? ` with ${result.ips} IP${result.ips === 1 ? '' : 's'} banned for the whole ban` : ''}.` });
  }

  if (body.action === 'kill') {
    const result = await mutePlayer(database, targetId, KILL_MUTE_SECONDS, true);
    if ('error' in result) return fail(result.error!, 500);
    // A pop-up type (not an Inbox one): the page shows it as the WASTED screen.
    await database.from('notifications').insert({ profile_id: targetId, type: 'killed', payload: { title: 'WASTED', message: `${username} killed you. You can't chat for ${KILL_MUTE_SECONDS} seconds.`, from: username } });
    return NextResponse.json({ ok: true, message: `You killed ${target.username}. They're muted for ${KILL_MUTE_SECONDS} seconds.` });
  }

  return fail('Unknown action.');
}
