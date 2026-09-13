import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json([], { status: 200 });
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: clans, error: clansErr }, { data: membership }] = await Promise.all([
    supabase.from('clans').select('id, name, description, tags, treasury, member_count, owner_profile_id, created_at').order('treasury', { ascending: false }),
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

  if (!name || name.length < 2) return NextResponse.json({ error: 'Clan name must be at least 2 characters.' }, { status: 400 });

  const { data: profile } = await supabase.from('profiles').select('tokens').eq('id', user.id).single();
  if (!profile || profile.tokens < 5000) {
    return NextResponse.json({ error: 'Creating a clan requires 5,000 tokens.' }, { status: 400 });
  }

  const { data: clan, error: clanErr } = await supabase
    .from('clans')
    .insert({
      name,
      description,
      tags,
      owner_profile_id: user.id,
      treasury: 0,
      member_count: 1,
    })
    .select()
    .single();

  if (clanErr) return NextResponse.json({ error: clanErr.message }, { status: 400 });

  await Promise.all([
    supabase.from('profiles').update({ tokens: profile.tokens - 5000 }).eq('id', user.id),
    supabase.from('clan_members').insert({ clan_id: clan.id, profile_id: user.id, role: 'leader', token_contributions: 0 }),
  ]);

  return NextResponse.json({ ok: true, clan }, { status: 201 });
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
