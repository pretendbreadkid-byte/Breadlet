import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';

async function session() {
  const client = await createClient();
  if (!client) return { response: NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 }) };
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { response: NextResponse.json({ error: 'Sign in to use reward requests.' }, { status: 401 }) };
  const admin = createAdminClient();
  if (!admin) return { response: NextResponse.json({ error: 'Server request handling is not configured.' }, { status: 503 }) };
  return { admin, userId: user.id };
}

async function hasReviewerAccess(admin: NonNullable<ReturnType<typeof createAdminClient>>, userId: string) {
  const [{ data: profile }, { data: role }] = await Promise.all([
    admin.from('profiles').select('stats').eq('id', userId).maybeSingle(),
    admin.from('admin_roles').select('role').eq('profile_id', userId).in('role', ['owner', 'admin']).limit(1).maybeSingle(),
  ]);
  return Boolean(profile?.stats?.can_review_requests || role);
}

export async function GET() {
  const current = await session();
  if ('response' in current) return current.response;
  const canReview = await hasReviewerAccess(current.admin, current.userId);
  let query = current.admin.from('reward_requests').select('*').order('created_at', { ascending: false }).limit(100);
  if (!canReview) query = query.eq('requester_profile_id', current.userId);
  const { data: requests, error } = await query;
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') {
      return NextResponse.json({ error: 'Migration requests are not installed in Supabase yet. Apply supabase/migrations/0004_reward_requests.sql.' }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const requesterIds = Array.from(new Set((requests || []).map((item) => item.requester_profile_id)));
  const { data: profiles } = requesterIds.length
    ? await current.admin.from('profiles').select('id, username').in('id', requesterIds)
    : { data: [] };
  const names = new Map((profiles || []).map((profile) => [profile.id, profile.username]));
  return NextResponse.json({ canReview, requests: (requests || []).map((item) => ({ ...item, is_mine: item.requester_profile_id === current.userId, requester_username: names.get(item.requester_profile_id) || 'Player' })) });
}

export async function POST(request: Request) {
  const current = await session();
  if ('response' in current) return current.response;
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || 'submit');

  if (action === 'unlock-reviewer') {
    const expectedCode = process.env.BREADLET_REQUEST_REVIEW_CODE || 'admin1234532!';
    if (!expectedCode || String(body.code || '') !== expectedCode) {
      return NextResponse.json({ error: 'Admin code is incorrect.' }, { status: 403 });
    }
    const { data: profile, error } = await current.admin.from('profiles').select('stats').eq('id', current.userId).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const stats = { ...(profile.stats || {}), can_review_requests: true };
    const { error: updateError } = await current.admin.from('profiles').update({ stats }).eq('id', current.userId);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    return NextResponse.json({ ok: true, canReview: true });
  }

  if (action === 'review') {
    const requestId = String(body.requestId || '');
    const decision = String(body.decision || '');
    if (!requestId || !['accept', 'decline'].includes(decision)) return NextResponse.json({ error: 'Choose a valid request and decision.' }, { status: 400 });
    const { data, error } = await current.admin.rpc('review_reward_request', {
      p_request_id: requestId,
      p_reviewer_id: current.userId,
      p_action: decision,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 403 });
    return NextResponse.json(data);
  }

  const requestedTokens = Math.floor(Number(body.tokens) || 0);
  const inputBlooks = Array.isArray(body.blooks) ? body.blooks : [];
  if (requestedTokens < 0 || requestedTokens > 100000) return NextResponse.json({ error: 'Token requests must be between 0 and 100,000.' }, { status: 400 });
  if (inputBlooks.length > 20) return NextResponse.json({ error: 'You can request up to 20 different Blooks at once.' }, { status: 400 });
  const counts = new Map<string, number>();
  for (const entry of inputBlooks) {
    const name = String(entry?.name || '').trim();
    const quantity = Math.floor(Number(entry?.quantity) || 0);
    if (!name || quantity < 1 || quantity > 100) return NextResponse.json({ error: 'Each Blook quantity must be from 1 to 100.' }, { status: 400 });
    counts.set(name, (counts.get(name) || 0) + quantity);
  }
  const blooks = Array.from(counts, ([name, quantity]) => ({ name, quantity }));
  if (!requestedTokens && !blooks.length) return NextResponse.json({ error: 'Select at least one Blook or request some tokens.' }, { status: 400 });
  if (blooks.some((item) => item.quantity > 100)) return NextResponse.json({ error: 'A Blook request cannot exceed 100 copies.' }, { status: 400 });
  if (blooks.length) {
    const { data: matches, error } = await current.admin.from('blooks').select('name').in('name', blooks.map((item) => item.name));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const validNames = new Set((matches || []).map((item) => item.name));
    const invalid = blooks.find((item) => !validNames.has(item.name));
    if (invalid) return NextResponse.json({ error: `${invalid.name} is not in the Blook catalog.` }, { status: 400 });
  }
  const { data, error } = await current.admin.from('reward_requests').insert({
    requester_profile_id: current.userId,
    requested_blooks: blooks,
    requested_tokens: requestedTokens,
  }).select('*').single();
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') {
      return NextResponse.json({ error: 'Migration requests are not installed in Supabase yet. Apply supabase/migrations/0004_reward_requests.sql.' }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json(data, { status: 201 });
}