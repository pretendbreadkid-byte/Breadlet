import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { kidModeBlock } from '../../../../lib/kid-mode';

export const dynamic = 'force-dynamic';

// Stats commands anyone can use in chat. The answer only shows to the player who typed it.
//   /leaderboard          players with the most coin flips, with their win ratio
//   !me  /  !<player>     a player's stats
//   !mycoinflips  /  !coinflips <player>   recent coin flips and how much they've made
// A "!word" that isn't a player comes back as { notCommand: true } so it's sent to chat as normal.
// Coin flips are the finished ones in chat_games (kind 'coinflip', status 'done', result.winnerId).

type Flip = { host_id: string; opponent_id: string | null; bet: number; result: any; created_at: string };
const reply = (message: string) => NextResponse.json({ ok: true, message });
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const num = (value: number) => Math.round(value).toLocaleString('en-US');
const signed = (value: number) => `${value >= 0 ? '+' : '-'}${num(Math.abs(value))}`;
const percent = (wins: number, total: number) => (total ? `${Math.round((wins / total) * 100)}%` : '-');

async function allPages<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>, max = 100000) {
  const rows: T[] = [];
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

const flipColumns = 'host_id, opponent_id, bet, result, created_at';
const flipsOf = (database: any, profileId: string) => allPages<Flip>((from, to) => database.from('chat_games').select(flipColumns)
  .eq('kind', 'coinflip').eq('status', 'done').or(`host_id.eq.${profileId},opponent_id.eq.${profileId}`)
  .order('created_at', { ascending: false }).range(from, to));

function summarize(flips: Flip[], profileId: string) {
  let wins = 0; let net = 0; let biggestWin = 0;
  for (const flip of flips) {
    const won = flip.result?.winnerId === profileId;
    if (won) { wins += 1; net += flip.bet; biggestWin = Math.max(biggestWin, flip.bet); } else net -= flip.bet;
  }
  return { total: flips.length, wins, losses: flips.length - wins, net, biggestWin };
}

// The leaderboard reads every finished flip, so it's kept for a minute.
let boardCache: { at: number; text: string } | null = null;

async function leaderboard(database: any) {
  if (boardCache && Date.now() - boardCache.at < 60000) return boardCache.text;
  const flips = await allPages<Flip>((from, to) => database.from('chat_games').select('host_id, opponent_id, bet, result')
    .eq('kind', 'coinflip').eq('status', 'done').order('created_at').range(from, to));
  const players = new Map<string, { total: number; wins: number; net: number }>();
  for (const flip of flips) {
    for (const id of [flip.host_id, flip.opponent_id]) {
      if (!id) continue;
      const entry = players.get(id) || { total: 0, wins: 0, net: 0 };
      const won = flip.result?.winnerId === id;
      entry.total += 1; entry.wins += won ? 1 : 0; entry.net += won ? flip.bet : -flip.bet;
      players.set(id, entry);
    }
  }
  const top = Array.from(players.entries()).sort((a, b) => b[1].total - a[1].total || b[1].wins - a[1].wins).slice(0, 10);
  const { data: profiles } = top.length ? await database.from('profiles').select('id, username').in('id', top.map(([id]) => id)) : { data: [] };
  const names = new Map((profiles || []).map((row: any) => [row.id, row.username]));
  const lines = top.map(([id, entry], index) =>
    `${index + 1}. ${names.get(id) || 'Deleted player'}: ${num(entry.total)} flips · ${entry.wins}W ${entry.total - entry.wins}L · ${percent(entry.wins, entry.total)} wins · ${signed(entry.net)} Bread Bucks`);
  const text = `🪙 Coin flip leaderboard (most flips)\n${lines.join('\n') || 'No coin flips yet.'}`;
  boardCache = { at: Date.now(), text };
  return text;
}

async function findPlayer(database: any, name: string) {
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(name)) return null;
  const { data } = await database.from('profiles').select('id, username, tokens, stats, created_at').ilike('username', name.replace(/_/g, '\\_')).maybeSingle();
  return data;
}

async function playerStats(database: any, profile: any) {
  const [inventory, bags, flips] = await Promise.all([
    allPages<{ quantity: number }>((from, to) => database.from('inventory').select('quantity').eq('profile_id', profile.id).range(from, to), 20000),
    database.from('chest_rolls').select('profile_id', { count: 'exact', head: true }).eq('profile_id', profile.id),
    flipsOf(database, profile.id),
  ]);
  const breadlets = inventory.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
  const opened = (bags.count || 0) + (Number(profile.stats?.capsulesOpened) || 0);
  const coin = summarize(flips, profile.id);
  const clan = profile.stats?.clanTag ? ` [${profile.stats.clanTag}]` : '';
  return [
    `📊 ${profile.username}${clan}`,
    `Bread Bucks: ${num(Number(profile.tokens) || 0)}`,
    `Breadlets: ${num(breadlets)} · Bags opened: ${num(opened)}`,
    `Coin flips: ${num(coin.total)} · ${coin.wins}W ${coin.losses}L · ${percent(coin.wins, coin.total)} wins · ${signed(coin.net)} Bread Bucks`,
    profile.created_at ? `Joined ${new Date(profile.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : '',
  ].filter(Boolean).join('\n');
}

async function coinflipHistory(database: any, profile: any) {
  const flips = await flipsOf(database, profile.id);
  if (!flips.length) return `🪙 ${profile.username} hasn't done any coin flips yet.`;
  const coin = summarize(flips, profile.id);
  const recent = flips.slice(0, 10);
  const others = Array.from(new Set(recent.map((flip) => (flip.host_id === profile.id ? flip.opponent_id : flip.host_id)).filter(Boolean))) as string[];
  const { data: profiles } = others.length ? await database.from('profiles').select('id, username').in('id', others) : { data: [] };
  const names = new Map((profiles || []).map((row: any) => [row.id, row.username]));
  const lines = recent.map((flip) => {
    const won = flip.result?.winnerId === profile.id;
    const other = flip.host_id === profile.id ? flip.opponent_id : flip.host_id;
    const when = new Date(flip.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${won ? '✅ Won' : '❌ Lost'} ${num(flip.bet)} vs ${names.get(other || '') || 'someone'} · ${when}`;
  });
  return [
    `🪙 ${profile.username}'s coin flips`,
    `Total made: ${signed(coin.net)} Bread Bucks · ${coin.wins}W ${coin.losses}L (${percent(coin.wins, coin.total)}) · biggest win ${num(coin.biggestWin)}`,
    `Last ${recent.length}:`,
    ...lines,
  ].join('\n');
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const database = createAdminClient();
  if (!supabase || !database) return fail('Stats are unavailable.', 503);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('Sign in to use commands.', 401);
  { const kid = await kidModeBlock(user.id); if (kid) return kid; }
  const body = await request.json().catch(() => ({}));
  const [head = '', ...args] = String(body.text || '').trim().split(/\s+/);
  const command = head.toLowerCase();

  try {
    if (command === '/leaderboard') return reply(await leaderboard(database));
    if (!command.startsWith('!')) return fail('Unknown command.');
    const word = command.slice(1);
    if (word === 'me' || word === 'mycoinflips') {
      const { data: me } = await database.from('profiles').select('id, username, tokens, stats, created_at').eq('id', user.id).maybeSingle();
      if (!me) return fail('Player not found.', 404);
      return reply(word === 'me' ? await playerStats(database, me) : await coinflipHistory(database, me));
    }
    if (word === 'coinflips') {
      if (!args[0]) return fail('Usage: !coinflips <player>');
      const target = await findPlayer(database, args[0].replace(/^@/, ''));
      return target ? reply(await coinflipHistory(database, target)) : fail(`No player called ${args[0]}.`, 404);
    }
    // !<player>: only when it's the whole message, so "!wow that's cool" still goes to chat.
    if (args.length === 0) {
      const target = await findPlayer(database, word.replace(/^@/, ''));
      if (target) return reply(await playerStats(database, target));
    }
    return NextResponse.json({ notCommand: true });
  } catch (problem) {
    return fail(problem instanceof Error ? problem.message : 'That command didn\'t work.', 500);
  }
}
