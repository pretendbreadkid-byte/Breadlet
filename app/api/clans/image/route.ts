import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { dataUrlImageResponse } from '../../../../lib/image-response';

// Serves a clan thumbnail. The list links here with ?v=<hash of the image>, so a new
// thumbnail gets a new URL and the old one can be cached for a long time.
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Bad clan id.' }, { status: 400 });
  const database = createAdminClient();
  if (!database) return NextResponse.json({ error: 'Unavailable.' }, { status: 503 });
  const { data } = await database.from('clans').select('thumbnail_url').eq('id', id).maybeSingle();
  const thumbnail = String(data?.thumbnail_url || '');
  if (!thumbnail) return NextResponse.json({ error: 'No thumbnail.' }, { status: 404 });
  if (/^https?:\/\//i.test(thumbnail)) return NextResponse.redirect(thumbnail);
  return dataUrlImageResponse(thumbnail, 'public, max-age=604800, s-maxage=604800, immutable');
}
