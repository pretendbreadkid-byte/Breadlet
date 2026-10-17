import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { createClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

const MAX_BANNER_BYTES = 1_000_000;
const bannerPattern = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

export async function POST(request: Request) {
  const client = await createClient();
  if (!client) return NextResponse.json({ error: "Clan banner uploads are not configured." }, { status: 503 });
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to update your clan banner." }, { status: 401 });
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BANNER_BYTES * 1.4) return NextResponse.json({ error: "Clan banners must be under 1 MB." }, { status: 413 });
  const body = await request.json().catch(() => null);
  const clanId = typeof body?.clanId === "string" ? body.clanId : "";
  const data = typeof body?.data === "string" ? body.data : "";
  const match = data.match(bannerPattern);
  if (!clanId || !match) return NextResponse.json({ error: "Upload a PNG, JPEG, or WebP clan banner." }, { status: 400 });
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > MAX_BANNER_BYTES) return NextResponse.json({ error: "Clan banners must be under 1 MB." }, { status: 413 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Clan banner uploads are not configured." }, { status: 503 });
  const { data: clan, error: lookupError } = await admin.from("clans")
    .select("id")
    .eq("id", clanId)
    .eq("owner_profile_id", user.id)
    .eq("banner_unlocked", true)
    .maybeSingle();
  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });
  if (!clan) return NextResponse.json({ error: "Unlock the banner upgrade and be the clan owner to upload a banner." }, { status: 403 });

  const { data: updated, error } = await admin.from("clans")
    .update({ banner_data: data })
    .eq("id", clanId)
    .eq("owner_profile_id", user.id)
    .eq("banner_unlocked", true)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "Clan ownership changed before the banner could be saved." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
