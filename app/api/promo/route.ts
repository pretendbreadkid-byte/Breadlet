import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { createAdminClient } from "../../../lib/supabase/admin";

// Beta access code for Breadlet Explore; unlocks the Explore tab for the account.
const EXPLORE_BETA_CODE = "breadletislands32";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const code = String(body.code || "").trim();

    if (code !== "Breadlet2.0" && code.toLowerCase() !== EXPLORE_BETA_CODE) {
      return NextResponse.json(
        { error: "That promo code is not active." },
        { status: 400 },
      );
    }

    const client = await createClient();

    if (!client) {
      return NextResponse.json(
        { error: "Supabase is not configured." },
        { status: 503 },
      );
    }

    const {
      data: { user },
    } = await client.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "You must be logged in." },
        { status: 401 },
      );
    }

    const admin = createAdminClient();

    if (!admin) {
      return NextResponse.json(
        { error: "Promo redemption is not configured." },
        { status: 503 },
      );
    }

    if (code.toLowerCase() === EXPLORE_BETA_CODE) {
      const { data: profile } = await admin.from("profiles").select("stats").eq("id", user.id).maybeSingle();
      if (!profile) return NextResponse.json({ error: "Player not found." }, { status: 404 });
      const { error: unlockError } = await admin.from("profiles").update({ stats: { ...(profile.stats || {}), exploreBeta: true } }).eq("id", user.id);
      if (unlockError) return NextResponse.json({ error: unlockError.message }, { status: 500 });
      return NextResponse.json({ ok: true, unlocked: "explore" });
    }

    const { error } = await admin.rpc("secure_builtin_promo", { p_profile_id: user.id });
    if (error) return NextResponse.json({ error: error.code === "PGRST202" ? "Apply migration 0015_secure_gameplay.sql to enable protected promo rewards." : error.message }, { status: 409 });

    return NextResponse.json({
      ok: true,
      amount: 1000,
    });
  } catch {
    return NextResponse.json(
      { error: "Promo redemption failed." },
      { status: 500 },
    );
  }
}
