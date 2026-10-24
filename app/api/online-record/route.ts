import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';

export const dynamic = 'force-dynamic';

const MIGRATION_MESSAGE = 'Run migration 0060_online_record.sql to start recording the most players online.';
const isUuid = (value: unknown) => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value);

async function session() {
  const supabase = await createClient();
  const database = createAdminClient();
  if (!supabase || !database) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user ? { database, user } : null;
}

// The current record: { record, at }.
export async function GET() {
  const current = await session();
  if (!current) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  const { data, error } = await current.database.from('app_settings').select('online_record, online_record_at').eq('id', 1).maybeSingle();
  if (error) return NextResponse.json({ error: /online_record/.test(error.message) ? MIGRATION_MESSAGE : error.message }, { status: 500 });
  return NextResponse.json({ record: Number(data?.online_record) || 0, at: data?.online_record_at || null });
}

// A player's browser reports the profile ids it sees online. Only real, non-banned accounts
// count, so the record can't be inflated by sending a big number.
export async function POST(request: Request) {
  const current = await session();
  if (!current) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const ids = Array.from(new Set((Array.isArray(body.ids) ? body.ids : []).filter(isUuid))).slice(0, 300) as string[];
  if (!ids.includes(current.user.id)) ids.push(current.user.id);
  const { count, error: countError } = await current.database.from('profiles').select('id', { count: 'exact', head: true }).in('id', ids).eq('is_banned', false);
  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });
  const { data, error } = await current.database.rpc('record_online_peak', { p_count: count || 0 });
  if (error) return NextResponse.json({ error: error.code === 'PGRST202' || /online_record/.test(error.message) ? MIGRATION_MESSAGE : error.message }, { status: 500 });
  return NextResponse.json(data);
}
