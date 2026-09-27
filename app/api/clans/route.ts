import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json([], { status: 200 });
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: clans, error: clansErr }, { data: membership }] = await Promise.all([
    supabase.from('clans').select('id, name, description, tags, treasury, member_count, owner_profile_id, thumbnail_url, created_at').order('treasury', { ascending: false }),
    user ? supabase.from('clan_members').select('clan_id, role, token_contributions').eq('profile_id', user.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  if (clansErr) return NextResponse.json({ error: clansErr.message }, { status: 500 });
  return NextResponse.json({ clans: clans || [], membership: membership || null });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const body = await request.json();
  const name = String(body.name || '').trim().slice(0, 30);
  const description = String(body.description || '').trim().slice(0, 200);
  const tags = Array.isArray(body.tags) ? body.tags.map((t: string) => String(t).trim()).filter(Boolean).slice(0, 3) : [];
  const thumbnailUrl = String(body.thumbnailUrl || '').trim().slice(0, 2_000_000);

  if (!name || name.length < 2) return NextResponse.json({ error: 'Clan name must be at least 2 characters.' }, { status: 400 });

  const { data, error } = await supabase.rpc('create_clan_with_cost', {
    p_name: name,
    p_description: description,
    p_tags: tags,
    p_thumbnail_url: thumbnailUrl || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const body = await request.json();
  const clanId = body.clanId;
  const amount = Math.max(1, Math.floor(Number(body.amount) || 100));
  if (!clanId) return NextResponse.json({ error: 'Clan ID is required.' }, { status: 400 });

  const [{ data: profile }, { data: clan }] = await Promise.all([
    supabase.from('profiles').select('tokens').eq('id', user.id).single(),
    supabase.from('clans').select('id, treasury').eq('id', clanId).single(),
  ]);

  if (!profile || profile.tokens < amount) {
    return NextResponse.json({ error: 'Insufficient tokens.' }, { status: 400 });
  }
  if (!clan) return NextResponse.json({ error: 'Clan not found.' }, { status: 404 });

  await Promise.all([
    supabase.from('profiles').update({ tokens: profile.tokens - amount }).eq('id', user.id),
    supabase.from('clans').update({ treasury: (clan.treasury || 0) + amount }).eq('id', clanId),
  ]);

  return NextResponse.json({ ok: true, treasury: (clan.treasury || 0) + amount });
}
