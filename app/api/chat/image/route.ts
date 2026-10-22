import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { dataUrlImageResponse } from '../../../../lib/image-response';

// Serves one chat image by message id. Images never change once posted, so browsers and the
// CDN cache them for a day instead of re-downloading them from the database on every refresh.
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Bad image id.' }, { status: 400 });
  const database = createAdminClient();
  if (!database) return NextResponse.json({ error: 'Unavailable.' }, { status: 503 });
  const { data } = await database.from('global_chat_messages').select('message').eq('id', id).is('deleted_at', null).maybeSingle();
  const match = String(data?.message || '').match(/^\[img\](data:image\/[^\]]+)\[\/img\]$/);
  if (!match) return NextResponse.json({ error: 'Image not found.' }, { status: 404 });
  return dataUrlImageResponse(match[1], 'public, max-age=86400, s-maxage=86400, immutable');
}
