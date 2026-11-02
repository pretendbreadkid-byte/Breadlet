import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { TERMS_VERSION } from '../../../../lib/terms';

export const dynamic = 'force-dynamic';

// Records that the player agreed to the current Terms of Service.
export async function POST() {
  const supabase = await createClient();
  const admin = createAdminClient();
  if (!supabase || !admin) return NextResponse.json({ error: 'Saving is unavailable.' }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in to save this.' }, { status: 401 });
  const { error } = await admin.from('profiles')
    .update({ terms_version: TERMS_VERSION, terms_accepted_at: new Date().toISOString() }).eq('id', user.id);
  // Migration 0074 isn't applied yet, and nothing asks players to agree until it is.
  if (error?.code === 'PGRST204' || error?.code === '42703') return NextResponse.json({ ok: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
