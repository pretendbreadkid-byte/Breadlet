import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

// Admin events still running, so players who load the page mid-event see it too.
export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json([]);
  const { data } = await supabase.from('admin_events').select('id, kind, message, created_at, ends_at')
    .gt('ends_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(5);
  return NextResponse.json(data || []);
}
