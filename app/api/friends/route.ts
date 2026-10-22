import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../lib/supabase/admin';
import { createClient } from '../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

async function session() {
  const client = await createClient();
  const admin = createAdminClient();
  if (!client || !admin) return { error: NextResponse.json({ error: 'Friends are unavailable.' }, { status: 503 }) };
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Sign in to use friends.' }, { status: 401 }) };
  return { admin, user };
}

type Row = { profile_id: string; friend_profile_id: string; status: string };

async function names(admin: any, ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const { data } = await admin.from('profiles').select('id, username').in('id', ids);
  return new Map<string, string>((data || []).map((row: { id: string; username: string }) => [row.id, row.username]));
}

// GET /api/friends            -> my friends plus requests
// GET /api/friends?profileId= -> that player's friends, and my relationship to them
export async function GET(request: Request) {
  const state = await session();
  if ('error' in state) return state.error;
  const { admin, user } = state;
  const profileId = new URL(request.url).searchParams.get('profileId') || user.id;

  const { data } = await admin.from('friends').select('profile_id, friend_profile_id, status')
    .or(`profile_id.eq.${profileId},friend_profile_id.eq.${profileId}`).limit(500);
  const rows = (data || []) as Row[];
  const otherOf = (row: Row) => (row.profile_id === profileId ? row.friend_profile_id : row.profile_id);
  const friendIds = rows.filter((row) => row.status === 'accepted').map(otherOf);
  const incoming = profileId === user.id ? rows.filter((row) => row.status === 'pending' && row.friend_profile_id === user.id).map((row) => row.profile_id) : [];
  const outgoing = profileId === user.id ? rows.filter((row) => row.status === 'pending' && row.profile_id === user.id).map((row) => row.friend_profile_id) : [];
  const lookup = await names(admin, [...friendIds, ...incoming, ...outgoing]);
  const toList = (ids: string[]) => ids.map((id) => ({ id, username: lookup.get(id) || 'Player' })).sort((a, b) => a.username.localeCompare(b.username));

  let relation: 'self' | 'friends' | 'pending-out' | 'pending-in' | 'none' = 'self';
  if (profileId !== user.id) {
    const { data: mine } = await admin.from('friends').select('profile_id, friend_profile_id, status')
      .or(`and(profile_id.eq.${user.id},friend_profile_id.eq.${profileId}),and(profile_id.eq.${profileId},friend_profile_id.eq.${user.id})`);
    const link = ((mine || []) as Row[])[0];
    relation = !link || link.status === 'declined' ? 'none'
      : link.status === 'accepted' ? 'friends'
      : link.profile_id === user.id ? 'pending-out' : 'pending-in';
  }
  return NextResponse.json({ friends: toList(friendIds), incoming: toList(incoming), outgoing: toList(outgoing), relation });
}

// POST { friendProfileId }: send a request, or accept if they already asked me.
export async function POST(request: Request) {
  const state = await session();
  if ('error' in state) return state.error;
  const { admin, user } = state;
  const { friendProfileId } = await request.json().catch(() => ({}));
  if (!friendProfileId || friendProfileId === user.id) return NextResponse.json({ error: 'Invalid friend.' }, { status: 400 });

  const { data: target } = await admin.from('profiles').select('id, username').eq('id', friendProfileId).maybeSingle();
  if (!target) return NextResponse.json({ error: 'Player not found.' }, { status: 404 });

  const { data: reverse } = await admin.from('friends').select('profile_id, status').eq('profile_id', friendProfileId).eq('friend_profile_id', user.id).maybeSingle();
  if (reverse) {
    if (reverse.status === 'accepted') return NextResponse.json({ ok: true, relation: 'friends' });
    await admin.from('friends').update({ status: 'accepted' }).eq('profile_id', friendProfileId).eq('friend_profile_id', user.id);
    return NextResponse.json({ ok: true, relation: 'friends', username: target.username });
  }
  const { error } = await admin.from('friends').upsert({ profile_id: user.id, friend_profile_id: friendProfileId, status: 'pending' }, { onConflict: 'profile_id,friend_profile_id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, relation: 'pending-out', username: target.username }, { status: 201 });
}

// PATCH { requesterId, decision: 'accept' | 'decline' }
export async function PATCH(request: Request) {
  const state = await session();
  if ('error' in state) return state.error;
  const { admin, user } = state;
  const { requesterId, decision } = await request.json().catch(() => ({}));
  if (!requesterId || !['accept', 'decline'].includes(decision)) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const { error } = await admin.from('friends')
    .update({ status: decision === 'accept' ? 'accepted' : 'declined' })
    .eq('profile_id', requesterId).eq('friend_profile_id', user.id).eq('status', 'pending');
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

// DELETE { friendProfileId }: unfriend or cancel a request.
export async function DELETE(request: Request) {
  const state = await session();
  if ('error' in state) return state.error;
  const { admin, user } = state;
  const { friendProfileId } = await request.json().catch(() => ({}));
  if (!friendProfileId) return NextResponse.json({ error: 'Invalid friend.' }, { status: 400 });
  await admin.from('friends').delete().or(`and(profile_id.eq.${user.id},friend_profile_id.eq.${friendProfileId}),and(profile_id.eq.${friendProfileId},friend_profile_id.eq.${user.id})`);
  return NextResponse.json({ ok: true });
}
