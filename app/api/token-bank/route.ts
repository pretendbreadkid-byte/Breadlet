import { NextResponse } from "next/server";
import { createAdminClient } from "../../../lib/supabase/admin";
import { bankBalance } from "../../../lib/bank";
import { createClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const client = await createClient();
  if (!client) return NextResponse.json({ error: "Sign in to view your Token Bank." }, { status: 503 });
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to view your Token Bank." }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Token Bank is not configured." }, { status: 503 });
  const { data, error } = await admin.from("token_spending_summary")
    .select("historical_estimate, tracked_spent")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    historicalEstimate: Number(data?.historical_estimate) || 0,
    trackedSpent: Number(data?.tracked_spent) || 0,
    bankBalance: await bankBalance(admin),
    totalSpent: (Number(data?.historical_estimate) || 0) + (Number(data?.tracked_spent) || 0),
  });
}
