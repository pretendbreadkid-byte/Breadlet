import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { hasAdminAccess } from '../../../../lib/admin-access';
import { dataUrlImageResponse } from '../../../../lib/image-response';

export const dynamic = 'force-dynamic';

// Pictures uploaded in edit mode. They never change, so browsers and the CDN keep them for a year
// instead of downloading them from the database again.
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Bad image id.' }, { status: 400 });
  const database = createAdminClient();
  if (!database) return NextResponse.json({ error: 'Unavailable.' }, { status: 503 });
  const { data } = await database.from('site_images').select('data').eq('id', id).maybeSingle();
  if (!data) return NextResponse.json({ error: 'Image not found.' }, { status: 404 });
  return dataUrlImageResponse(data.data, 'public, max-age=31536000, s-maxage=31536000, immutable');
}

/// Owner only. Body: { data } with a base64 PNG, JPEG, GIF, WebP or SVG data URL. SVGs are served with
// a sandbox policy (image-response.ts) and only ever shown through <img>, so scripts in them can't run.
export async function POST(request: Request) {
  const supabase = await createClient();
  const database = createAdminClient();
  if (!supabase || !database) return NextResponse.json({ error: 'Uploading is unavailable.' }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  if (!(await hasAdminAccess(database, user.id))) return NextResponse.json({ error: 'Only the owner can use edit mode.' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const data = String(body.data || '');
  if (!/^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(data) || data.length > 700000) {
    return NextResponse.json({ error: 'That picture could not be uploaded. Try a smaller PNG, JPEG or SVG.' }, { status: 400 });
  }
  const { data: row, error } = await database.from('site_images').insert({ data }).select('id').single();
  if (error) {
    const missing = error.code === '42P01' || error.code === 'PGRST205';
    return NextResponse.json({ error: missing ? 'Run migration 0076_edit_mode.sql in Supabase to use edit mode.' : error.message }, { status: missing ? 503 : 500 });
  }
  return NextResponse.json({ url: `/api/site/image?id=${row.id}` });
}
