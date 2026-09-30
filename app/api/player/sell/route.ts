import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { createClient } from '../../../../lib/supabase/server';

const sellValues: Record<string, number> = {
  Common: 5,
  Uncommon: 12,
  Rare: 30,
  Epic: 75,
  Legendary: 150,
  Mythic: 300,
  Unique: 500,
  Transcendent: 1000,
};

export async function POST(request: Request) {
  const sessionClient = await createClient();
  if (!sessionClient) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Server inventory saving is not configured.' }, { status: 503 });
  const body = await request.json();
  const requested = body.quantities && typeof body.quantities === 'object' ? body.quantities as Record<string, unknown> : {};

  const [{ data: inventory, error: inventoryError }, { data: profile, error: profileError }] = await Promise.all([
    admin.from('inventory').select('id, quantity, shiny, blooks(name, rarity)').eq('profile_id', user.id),
    admin.from('profiles').select('tokens').eq('id', user.id).single(),
  ]);
  if (inventoryError) return NextResponse.json({ error: inventoryError.message }, { status: 400 });
  if (profileError || !profile) return NextResponse.json({ error: profileError?.message || 'Player not found.' }, { status: 404 });

  let tokensEarned = 0;
  const sold: Record<string, number> = {};
  const updates: PromiseLike<unknown>[] = [];
  for (const row of inventory || []) {
    const blook = row.blooks as unknown as { name: string; rarity: string } | null;
    if (!blook) continue;
    const displayName = `${row.shiny ? 'Shiny ' : ''}${blook.name}`;
    const amount = Math.min(Math.max(0, Math.floor(Number(requested[displayName]) || 0)), Math.max(0, row.quantity - 1));
    if (!amount) continue;
    tokensEarned += amount * (sellValues[blook.rarity] || 5);
    sold[displayName] = amount;
    updates.push(admin.from('inventory').update({ quantity: row.quantity - amount }).eq('id', row.id));
  }

  if (!tokensEarned) return NextResponse.json({ error: 'Choose at least one extra Bread to sell.' }, { status: 400 });
  const results = await Promise.all(updates);
  const updateError = (results as Array<{ error?: { message: string } }>).find((result) => result.error)?.error;
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });

  const tokens = Math.max(0, Number(profile.tokens) || 0) + tokensEarned;
  const { error: tokenError } = await admin.from('profiles').update({ tokens }).eq('id', user.id);
  if (tokenError) return NextResponse.json({ error: tokenError.message }, { status: 400 });

  return NextResponse.json({ sold, tokensEarned, tokens });
}
