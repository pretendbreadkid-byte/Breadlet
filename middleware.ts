import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const DEVICE_COOKIE = 'breadlet_device';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });
  // Give every browser a device ID so bans and the one-account rule survive IP changes.
  if (!request.cookies.get(DEVICE_COOKIE)) {
    response.cookies.set(DEVICE_COOKIE, crypto.randomUUID(), { maxAge: 60 * 60 * 24 * 365 * 10, sameSite: 'lax', path: '/', secure: process.env.NODE_ENV === 'production' });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;
  // API routes check (and refresh) the session themselves; checking here too doubled the
  // load on Supabase Auth and made every request hang whenever Auth was slow.
  if (request.nextUrl.pathname.startsWith('/api/')) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      },
    },
  });
  // Refresh the session for page loads, but never let a slow Auth server hang the page.
  await Promise.race([supabase.auth.getUser().catch(() => null), new Promise((resolve) => setTimeout(resolve, 4000))]);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|assets/).*)'],
};
