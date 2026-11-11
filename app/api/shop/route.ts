import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';
import { limitedItemsOnSale } from '../../../lib/limited-shop';

// What Supabase answers until migration 0083 has been run.
const NOT_INSTALLED = new Set(['PGRST202', '42883']);

// Buy a limited Breadlet off Ted's shelf (lib/limited-shop.ts) for Bread Bucks.
export async function POST(request: Request) {
  const supabase = await createClient();
  const database = createAdminClient();
  if (!supabase || !database) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Log in to buy this.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const item = limitedItemsOnSale().find((entry) => entry.name === body.item);
  if (!item) return NextResponse.json({ error: "That isn't for sale anymore." }, { status: 410 });

  const { data, error } = await database.rpc('buy_shop_blook', { p_profile_id: user.id, p_item: item.name, p_price: item.price });
  if (error) {
    if (NOT_INSTALLED.has(error.code)) return NextResponse.json({ error: 'Ted is still stocking this. Try again soon.' }, { status: 503 });
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  return NextResponse.json(data);
}
