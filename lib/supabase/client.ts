import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createBrowserClient(url, key);
}

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
  );
}

async function fetchSessionApi(url: string, init: RequestInit = {}) {
  const client = createClient();
  const { data } = client ? await client.auth.getSession() : { data: { session: null } };
  const send = (token?: string) => {
    const headers = new Headers(init.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(url, { ...init, headers, credentials: 'same-origin' });
  };
  const response = await send(data.session?.access_token);
  if (response.status !== 401 || !client) return response;
  const refreshed = await client.auth.refreshSession();
  if (refreshed.error || !refreshed.data.session) return response;
  return send(refreshed.data.session.access_token);
}

export const fetchTradeApi = (init: RequestInit = {}) => fetchSessionApi('/api/trades', init);
export const fetchGameplayApi = (init: RequestInit = {}) => fetchSessionApi('/api/gameplay', init);
