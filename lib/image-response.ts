import { NextResponse } from 'next/server';

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];

// Turns a base64 data URL stored in the database into a real image response.
// The CSP sandbox stops scripts inside uploaded SVGs from running if the URL is opened directly.
export function dataUrlImageResponse(dataUrl: string, cacheControl: string) {
  const match = dataUrl.match(/^data:([a-z+/.-]+);base64,([A-Za-z0-9+/=]+)$/i);
  if (!match || !ALLOWED_TYPES.includes(match[1].toLowerCase())) return NextResponse.json({ error: 'Unsupported image.' }, { status: 415 });
  return new NextResponse(Buffer.from(match[2], 'base64'), {
    headers: {
      'Content-Type': match[1].toLowerCase(),
      'Cache-Control': cacheControl,
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
