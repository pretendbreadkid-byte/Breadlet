import { NextResponse } from 'next/server';
import { hasAdminAccess } from '../../../lib/admin-access';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';

export const dynamic = 'force-dynamic';

const MAX_IMAGE_LENGTH = 400000;

async function session() {
  const supabase = await createClient();
  if (!supabase) return { response: NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 }) };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { response: NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }) };
  const admin = createAdminClient();
  if (!admin) return { response: NextResponse.json({ error: 'Emoji server is not configured.' }, { status: 503 }) };
  return { admin, userId: user.id, isAdmin: await hasAdminAccess(admin, user.id) };
}

export async function GET() {
  const current = await session();
  if ('response' in current) return current.response;
  const { data, error } = await current.admin.from('chat_emojis').select('id, name, image').order('created_at', { ascending: true }).limit(300);
  if (error) {
    // Migration not applied yet: show an empty custom tab instead of breaking chat.
    return NextResponse.json({ emojis: [], canManage: current.isAdmin });
  }
  return NextResponse.json({ emojis: data || [], canManage: current.isAdmin });
}

export async function POST(request: Request) {
  const current = await session();
  if ('response' in current) return current.response;
  if (!current.isAdmin) return NextResponse.json({ error: 'Only admins can add emojis.' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const name = String(body.name || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 24);
  const image = String(body.image || '');
  if (!/^[a-z0-9_]{2,24}$/.test(name)) return NextResponse.json({ error: 'Emoji names must be 2-24 letters, numbers, or underscores.' }, { status: 400 });
  if (!/^data:image\/(png|gif|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) return NextResponse.json({ error: 'Upload a PNG, GIF, JPEG, or WebP image.' }, { status: 400 });
  if (image.length > MAX_IMAGE_LENGTH) return NextResponse.json({ error: 'That image is too large. Keep emojis under about 280 KB.' }, { status: 400 });
  const { data, error } = await current.admin.from('chat_emojis').insert({ name, image, created_by: current.userId }).select('id, name, image').single();
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'An emoji with that name already exists.' }, { status: 409 });
    return NextResponse.json({ error: error.code === '42P01' || error.code === 'PGRST205' ? 'Apply migration 0038_live_trading_and_emojis.sql to enable custom emojis.' : error.message }, { status: 400 });
  }
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(request: Request) {
  const current = await session();
  if ('response' in current) return current.response;
  if (!current.isAdmin) return NextResponse.json({ error: 'Only admins can remove emojis.' }, { status: 403 });
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!id) return NextResponse.json({ error: 'An emoji ID is required.' }, { status: 400 });
  const { error } = await current.admin.from('chat_emojis').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ id });
}
