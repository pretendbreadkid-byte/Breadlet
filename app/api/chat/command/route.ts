import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { chatModerationRole, hasAdminAccess, isProtectedFromMute } from '../../../../lib/admin-access';
import { commandsFor } from '../../../../lib/chat-commands';
import { liveCapsules } from '../../../../lib/gameplay-catalog';

export const dynamic = 'force-dynamic';

const STOCK_MIGRATION = 'Apply migration 0069_admin_stock.sql to use /stock.';

const reply = (message: string, status = 200) => NextResponse.json(status === 200 ? { ok: true, message } : { error: message }, { status });

// Staff chat commands: /mute, /unmute (moderators and the admin), /ban, /unban, /unbannetwork, /give, /announce,
// /stock, /unstock (the admin only) and /help. The command text is never posted to chat.
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
  if (command === 'stock' || command === 'unstock') {
    // "/stock space bag 30", "/stock fall" or "/unstock food bag": the minutes come last.
    const minutesGiven = command === 'stock' && /^\d+$/.test(args.at(-1) || '');
    const query = (minutesGiven ? args.slice(0, -1) : args).join(' ').trim().toLowerCase();
    if (!query) return reply(`Usage: ${allowed.usage}`, 400);
    const pack = liveCapsules.find((capsule) => capsule.name.toLowerCase() === query)
      || liveCapsules.find((capsule) => capsule.name.toLowerCase().replace(/ bag$/, '') === query.replace(/ bag$/, ''))
      || liveCapsules.find((capsule) => capsule.name.toLowerCase().startsWith(query));
    if (!pack) return reply(`No bag called "${query}". Bags: ${liveCapsules.map((capsule) => capsule.name).join(', ')}.`, 404);
    if (command === 'unstock') {
      const { data, error } = await database.from('market_stock_overrides').delete().eq('pack_name', pack.name).select('pack_name');
      if (error) return reply(error.code === '42P01' || error.code === 'PGRST205' ? STOCK_MIGRATION : error.message, 500);
      return reply(data?.length ? `${pack.name} is back on the normal hourly stock.` : `${pack.name} wasn't put in stock with /stock.`);
    }
    const minutes = minutesGiven ? Math.min(1440, Math.max(1, Number(args.at(-1)))) : 60;
    const endsAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    const { error } = await database.from('market_stock_overrides').upsert({ pack_name: pack.name, ends_at: endsAt, created_by: user.id });
    if (error) return reply(error.code === '42P01' || error.code === 'PGRST205' ? STOCK_MIGRATION : error.message, 500);
    const time = minutes % 60 === 0 ? `${minutes / 60} hour${minutes === 60 ? '' : 's'}` : `${minutes} minute${minutes === 1 ? '' : 's'}`;
    // The global banner at the top of everyone's screen (admin_events, migration 0058).
    await database.from('admin_events').insert({
      kind: 'announcement',
      message: `📦 ${pack.name} was just stocked! Get it in Ted's Shop for the next ${time}.`,
      created_by: user.id,
      ends_at: new Date(Date.now() + 10 * 1000).toISOString(),
    });
    return reply(`${pack.name} is in stock for ${time}.`);
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
  if (command === 'unbannetwork') {
    const { data, error } = await database.from('network_bans').delete().eq('profile_id', target.id).select('kind');
    if (error) return reply(error.message, 500);
    if (!data?.length) return reply(`${target.username} has no device or network bans.`);
    return reply(`Lifted ${data.length} device and network ban${data.length === 1 ? '' : 's'} from ${target.username}.${target.is_banned ? ' Their account is still banned.' : ''}`);
  }
  if (command === 'give') {
    const amount = Math.floor(Number(args[1]));
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 10000000) return reply('Usage: /give <player> <amount> (1 to 10,000,000)', 400);
    const { error } = await database.from('profiles').update({ tokens: Math.min(2147483647, Number(target.tokens || 0) + amount) }).eq('id', target.id);
    return error ? reply(error.message, 500) : reply(`Gave ${target.username} ${amount.toLocaleString()} Bread Bucks.`);
  }
  return reply('Unknown command.', 400);
}
