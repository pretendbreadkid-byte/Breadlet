import { NextResponse } from 'next/server';
import { hasAdminAccess } from '../../../../lib/admin-access';
import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';

export const dynamic = 'force-dynamic';

// A player's history for admins (opened from their profile): Bread Bucks changes, trades, Bazaar
// listings, bans and recent chat. GET ?targetId=<profile id>
export async function GET(request: Request) {
  const sessionClient = await createClient();
  if (!sessionClient) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  const database = createAdminClient();
  if (!database) return NextResponse.json({ error: 'Admin server configuration is missing.' }, { status: 503 });
  if (!(await hasAdminAccess(database, user.id))) return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 });

  const targetId = new URL(request.url).searchParams.get('targetId') || '';
  if (!/^[0-9a-f-]{36}$/i.test(targetId)) return NextResponse.json({ error: 'Choose a player.' }, { status: 400 });

  const [profile, money, trades, listings, bans, chat, devices] = await Promise.all([
    database.from('profiles').select('id, username, tokens, created_at, is_banned, ban_reason, ban_expires_at, stats').eq('id', targetId).maybeSingle(),
    database.from('token_transactions').select('id, type, delta, reason, created_at').eq('profile_id', targetId).order('created_at', { ascending: false }).limit(150),
    database.from('trades').select('id, sender_profile_id, receiver_profile_id, sender_offer_json, receiver_offer_json, status, created_at, updated_at')
      .or(`sender_profile_id.eq.${targetId},receiver_profile_id.eq.${targetId}`).neq('status', 'pending').order('created_at', { ascending: false }).limit(60),
    database.from('marketplace_listings').select('id, blook_id, quantity, price, status, created_at, sold_at, shiny').eq('profile_id', targetId).order('created_at', { ascending: false }).limit(60),
    database.from('bans').select('id, reason, is_permanent, started_at, expires_at').eq('profile_id', targetId).order('started_at', { ascending: false }).limit(20),
    database.from('global_chat_messages').select('id, message, created_at, deleted_at').eq('profile_id', targetId).order('created_at', { ascending: false }).limit(60),
    database.from('account_devices').select('device_hash, ip_hash, last_seen_at').eq('profile_id', targetId),
  ]);
  if (!profile.data) return NextResponse.json({ error: 'Player not found.' }, { status: 404 });

  // Names for the other side of each trade, and for Breadlets listed on the Bazaar.
  const others = Array.from(new Set((trades.data || []).map((trade: any) => (trade.sender_profile_id === targetId ? trade.receiver_profile_id : trade.sender_profile_id)).filter(Boolean)));
  const blookIds = Array.from(new Set((listings.data || []).map((listing: any) => listing.blook_id).filter(Boolean)));
  // Other accounts that used the same device (alts).
  const deviceHashes = Array.from(new Set((devices.data || []).map((row: any) => row.device_hash).filter(Boolean)));
  const [people, blooks, shared] = await Promise.all([
    others.length ? database.from('profiles').select('id, username').in('id', others) : Promise.resolve({ data: [] }),
    blookIds.length ? database.from('blooks').select('id, name').in('id', blookIds) : Promise.resolve({ data: [] }),
    deviceHashes.length ? database.from('account_devices').select('profile_id').in('device_hash', deviceHashes.slice(0, 50)).neq('profile_id', targetId) : Promise.resolve({ data: [] }),
  ]);
  const altIds = Array.from(new Set(((shared as any).data || []).map((row: any) => row.profile_id)));
  const alts = altIds.length ? (await database.from('profiles').select('id, username, is_banned').in('id', altIds.slice(0, 30))).data || [] : [];
  const nameOf = new Map(((people as any).data || []).map((row: any) => [row.id, row.username]));
  const blookName = new Map(((blooks as any).data || []).map((row: any) => [row.id, row.name]));
  const offer = (json: any) => ({
    tokens: Number(json?.tokens) || 0,
    blooks: (Array.isArray(json?.blooks) ? json.blooks : []).map((item: any) => ({ name: String(item?.name || ''), quantity: Number(item?.quantity) || 1 })),
  });
  const stats = (profile.data.stats || {}) as Record<string, any>;

  return NextResponse.json({
    profile: {
      id: profile.data.id, username: profile.data.username, tokens: profile.data.tokens, createdAt: profile.data.created_at,
      isBanned: profile.data.is_banned, banReason: profile.data.ban_reason, banExpiresAt: profile.data.ban_expires_at,
      chatMutedUntil: typeof stats.chatMutedUntil === 'string' ? stats.chatMutedUntil : null,
      recoveryUntil: typeof stats.recovery?.expiresAt === 'string' && Date.parse(stats.recovery.expiresAt) > Date.now() ? stats.recovery.expiresAt : null,
    },
    money: money.data || [],
    trades: (trades.data || []).map((trade: any) => {
      const sent = trade.sender_profile_id === targetId;
      return {
        id: trade.id, status: trade.status, at: trade.updated_at || trade.created_at,
        with: nameOf.get(sent ? trade.receiver_profile_id : trade.sender_profile_id) || 'Deleted player',
        gave: offer(sent ? trade.sender_offer_json : trade.receiver_offer_json),
        got: offer(sent ? trade.receiver_offer_json : trade.sender_offer_json),
      };
    }),
    listings: (listings.data || []).map((listing: any) => ({ ...listing, name: blookName.get(listing.blook_id) || 'Unknown' })),
    bans: bans.data || [],
    chat: chat.data || [],
    alts,
    devices: deviceHashes.length,
  });
}
