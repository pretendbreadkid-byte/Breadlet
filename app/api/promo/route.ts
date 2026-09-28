import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { createAdminClient } from "../../../lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const code = String(body.code || "").trim();

    if (code !== "Breadlet2.0") {
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

    const { error: redemptionError } = await admin
      .from("promo_redemptions")
      .insert({
        profile_id: user.id,
        promo_code: code,
      });

    if (redemptionError) {
      if (redemptionError.code === "23505") {
        return NextResponse.json(
          { error: "You already redeemed this promo code." },
          { status: 400 },
        );
      }

      return NextResponse.json(
        { error: redemptionError.message },
        { status: 500 },
      );
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("tokens")
      .eq("id", user.id)
      .single();

    if (profileError) {
      await admin
        .from("promo_redemptions")
        .delete()
        .eq("profile_id", user.id)
        .eq("promo_code", code);

      return NextResponse.json(
        { error: profileError.message },
        { status: 500 },
      );
    }

    const { error: updateError } = await admin
      .from("profiles")
      .update({ tokens: (profile.tokens || 0) + 1000 })
      .eq("id", user.id);

    if (updateError) {
      await admin
        .from("promo_redemptions")
        .delete()
        .eq("profile_id", user.id)
        .eq("promo_code", code);

      return NextResponse.json(
        { error: updateError.message },
        { status: 500 },
      );
    }

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
