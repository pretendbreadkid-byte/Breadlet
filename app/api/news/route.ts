import { NextResponse } from 'next/server';
import { hasAdminAccess } from '../../../lib/admin-access';
import { dataUrlImageResponse } from '../../../lib/image-response';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';

export const dynamic = 'force-dynamic';

const MAX_IMAGE_LENGTH = 1500000;
const MISSING_TABLE = 'Apply migration 0067_secret_rarity_and_news.sql to enable Breadlet News.';

async function session() {
  const supabase = await createClient();
  if (!supabase) return { response: NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 }) };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { response: NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }) };
  const admin = createAdminClient();
  if (!admin) return { response: NextResponse.json({ error: 'News is not configured.' }, { status: 503 }) };
  return { admin, userId: user.id, isAdmin: await hasAdminAccess(admin, user.id) };
}

// GET: the latest posts (without image data), or ?image=<id> for one post's image.
export async function GET(request: Request) {
  const imageId = new URL(request.url).searchParams.get('image');
  if (imageId) {
    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: 'News is not configured.' }, { status: 503 });
    const { data } = await admin.from('news_posts').select('image').eq('id', imageId).maybeSingle();
    if (!data?.image) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return dataUrlImageResponse(data.image, 'public, max-age=86400, immutable');
  }
  const current = await session();
  if ('response' in current) return current.response;
  const { data, error } = await current.admin
    .from('news_posts')
    .select('id, category, title, body, created_at, has_image')
    .order('created_at', { ascending: false })
    .limit(30);
  // Migration not applied yet: show "No news yet" instead of an error.
  if (error) return NextResponse.json({ posts: [], canManage: current.isAdmin });
  return NextResponse.json({ posts: data || [], canManage: current.isAdmin });
}

export async function POST(request: Request) {
  const current = await session();
  if ('response' in current) return current.response;
  if (!current.isAdmin) return NextResponse.json({ error: 'Only admins can post news.' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const category = String(body.category || 'Update').trim().slice(0, 40) || 'Update';
  const title = String(body.title || '').trim().slice(0, 120);
  const text = String(body.body || '').trim().slice(0, 4000);
  const image = body.image ? String(body.image) : null;
  if (!title) return NextResponse.json({ error: 'Give the post a title.' }, { status: 400 });
  if (image && !/^data:image\/(png|gif|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) return NextResponse.json({ error: 'Upload a PNG, GIF, JPEG, or WebP image.' }, { status: 400 });
  if (image && image.length > MAX_IMAGE_LENGTH) return NextResponse.json({ error: 'That image is too large. Keep it under about 1 MB.' }, { status: 400 });
  const { data, error } = await current.admin
    .from('news_posts')
    .insert({ category, title, body: text, image, created_by: current.userId })
    .select('id, category, title, body, created_at')
    .single();
  if (error) return NextResponse.json({ error: error.code === '42P01' || error.code === 'PGRST205' ? MISSING_TABLE : error.message }, { status: 400 });
  return NextResponse.json({ ...data, has_image: Boolean(image) }, { status: 201 });
}

export async function DELETE(request: Request) {
  const current = await session();
  if ('response' in current) return current.response;
  if (!current.isAdmin) return NextResponse.json({ error: 'Only admins can remove news.' }, { status: 403 });
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!id) return NextResponse.json({ error: 'A post ID is required.' }, { status: 400 });
  const { error } = await current.admin.from('news_posts').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ id });
}
