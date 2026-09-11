import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

const materialNames = ['Flour', 'Metal', 'Gem', 'Gold', 'Cloth', 'Sugar'];

function emptyMaterials() {
  return Object.fromEntries(materialNames.map((name) => [name, 0]));
}

export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const [{ data: profile, error: profileError }, { data: inventory }, { data: mine }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('inventory').select('quantity, blooks(name)').eq('profile_id', user.id),
    supabase.from('mine_progress').select('*').eq('profile_id', user.id).maybeSingle(),
  ]);
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

  return NextResponse.json({
    profile,
    inventory: (inventory || []).flatMap((entry: { quantity: number; blooks: { name: string }[] | null }) =>
      Array.from({ length: entry.quantity }, () => entry.blooks?.[0]?.name).filter(Boolean),
    ),
    materials: { ...emptyMaterials(), ...(profile.materials || {}) },
    mine,
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  const body = await request.json();
  const username = String(body.username || user.user_metadata?.username || user.email?.split('@')[0] || 'BreadletPlayer').trim().slice(0, 20);

  const { error } = await supabase.from('profiles').upsert({
    id: user.id,
    username,
    tokens: Math.max(0, Math.min(2500, Number(body.tokens) || 250)),
    luck: 0,
    stats: {},
    mine_progress: {},
    materials: { ...emptyMaterials(), ...(body.materials || {}) },
    account_status: 'active',
  }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return GET();
}
