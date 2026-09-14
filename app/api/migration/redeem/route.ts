import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';

// Redemption remains deliberately disabled until imported records and the RPC are validated in staging.
export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  const { code } = await request.json();
  if (!String(code || '').trim()) return NextResponse.json({ error: 'Migration code is required.' }, { status: 400 });
  if (process.env.BREADLET_MIGRATIONS_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Migration redemption is not active yet.' }, { status: 503 });
  }
  const { data, error } = await supabase.rpc('redeem_breadlet_migration', { supplied_code: String(code).trim() });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}