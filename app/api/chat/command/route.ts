import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { chatModerationRole, hasAdminAccess, isProtectedFromMute } from '../../../../lib/admin-access';
import { commandsFor } from '../../../../lib/chat-commands';

export const dynamic = 'force-dynamic';

const reply = (message: string, status = 200) => NextResponse.json(status === 200 ? { ok: true, message } : { error: message }, { status });

// Staff chat commands: /mute, /unmute (moderators and the admin), /ban, /unban, /give, /announce
// (the admin only) and /help. The command text is never posted to chat.
export async function POST(request: Request) {
  const supabase = await createClient();
  const database = createAdminClient();
  if (!supabase || !database) return reply('Commands are unavailable.', 503);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return reply('Sign in to use commands.', 401);
  const body = await request.json().catch(() => ({}));
  const [head = '', ...args] = String(body.text || '').trim().split(/\s+/);
  const command = head.replace(/^\//, '').toLowerCase();

  const [moderation, admin] = await Promise.all([chatModerationRole(database, user.id), hasAdminAccess(database, user.id)]);
  const role = admin ? 'admin' : moderation;
  const allowed = commandsFor(role).find((entry) => entry.name === command && entry.role !== 'everyone');
  if (!allowed) return reply(`/${command} isn't a command you can use.`, 403);

  if (command === 'help') {
    return reply(commandsFor(role).map((entry) => `${entry.usage} - ${entry.description}`).join('\n'));
  }
  if (command === 'announce') {
    const text = args.join(' ').trim().slice(0, 400);
    if (!text) return reply('Usage: /announce <message>', 400);
    const { error } = await database.rpc('chat_game_bot_say', { p_profile_id: user.id, p_message: text });
    return error ? reply(error.message, 500) : reply('Announced.');
  }

  const name = String(args[0] || '').replace(/^@/, '');
  if (!name) return reply(`Usage: ${allowed.usage}`, 400);
  const { data: target } = await database.from('profiles').select('id, username, tokens, stats, is_banned').ilike('username', name).maybeSingle();
  if (!target) return reply(`No player named ${name}.`, 404);
  if (target.id === user.id && command !== 'give') return reply('You can\'t do that to yourself.', 400);
  if (['mute', 'ban'].includes(command) && isProtectedFromMute(target.username)) return reply(`${target.username} is staff and can't be ${command === 'ban' ? 'banned' : 'muted'}.`, 403);

  if (command === 'mute') {
    const minutes = Math.min(1440, Math.max(1, Math.floor(Number(args[1]) || 30)));
    const until = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    const { error } = await database.from('profiles').update({ stats: { ...(target.stats || {}), chatMutedUntil: until } }).eq('id', target.id);
    return error ? reply(error.message, 500) : reply(`${target.username} is muted for ${minutes} minute${minutes === 1 ? '' : 's'}.`);
  }
  if (command === 'unmute') {
    const { chatMutedUntil, ...stats } = target.stats || {};
    const { error } = await database.from('profiles').update({ stats }).eq('id', target.id);
    return error ? reply(error.message, 500) : reply(chatMutedUntil ? `${target.username} can chat again.` : `${target.username} wasn't muted.`);
  }
  if (command === 'ban') {
    const hours = /^\d+$/.test(String(args[1] || '')) ? Math.min(8760, Math.max(1, Number(args[1]))) : 0;
    const reason = args.slice(hours ? 2 : 1).join(' ').trim().slice(0, 500) || 'Banned by an admin.';
    const expiresAt = hours ? new Date(Date.now() + hours * 60 * 60 * 1000).toISOString() : null;
    const { error } = await database.from('bans').insert({ profile_id: target.id, reason, is_permanent: !hours, expires_at: expiresAt, created_by_admin_id: user.id });
    if (error) return reply(error.message, 500);
    await database.from('profiles').update({ is_banned: true, ban_reason: reason, ban_expires_at: expiresAt }).eq('id', target.id);
    return reply(`${target.username} is banned ${hours ? `for ${hours} hour${hours === 1 ? '' : 's'}` : 'permanently'}. Reason: ${reason}`);
  }
  if (command === 'unban') {
    if (!target.is_banned) return reply(`${target.username} isn't banned.`);
    const now = new Date().toISOString();
    await database.from('bans').update({ is_permanent: false, expires_at: now }).eq('profile_id', target.id).or(`is_permanent.eq.true,expires_at.is.null,expires_at.gt.${now}`);
    const { error } = await database.from('profiles').update({ is_banned: false, ban_reason: null, ban_expires_at: null, stats: { ...(target.stats || {}), altAppealApproved: true } }).eq('id', target.id);
    if (error) return reply(error.message, 500);
    await database.from('network_bans').delete().eq('profile_id', target.id);
    return reply(`${target.username} is unbanned.`);
  }
  if (command === 'give') {
    const amount = Math.floor(Number(args[1]));
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 10000000) return reply('Usage: /give <player> <amount> (1 to 10,000,000)', 400);
    const { error } = await database.from('profiles').update({ tokens: Math.min(2147483647, Number(target.tokens || 0) + amount) }).eq('id', target.id);
    return error ? reply(error.message, 500) : reply(`Gave ${target.username} ${amount.toLocaleString()} Bread Bucks.`);
  }
  return reply('Unknown command.', 400);
}
