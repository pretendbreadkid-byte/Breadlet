import { POST as gameplay } from '../../gameplay/route';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  return gameplay(new Request(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify({ action: 'sell', quantities: body.quantities }),
  }));
}
