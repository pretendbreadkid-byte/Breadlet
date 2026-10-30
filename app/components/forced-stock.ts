"use client";

// Packs an admin put in stock with /stock, kept live through Realtime (see migration 0069).
import { useEffect, useState } from "react";
import { createClient as createSupabaseClient } from "../../lib/supabase/client";
import type { ForcedStock } from "../../lib/market-stock";

export function useForcedStock() {
  const [forced, setForced] = useState<ForcedStock>({});
  useEffect(() => {
    const supabase = createSupabaseClient();
    if (!supabase) return;
    const load = async () => {
      const { data, error } = await supabase.from("market_stock_overrides").select("pack_name, ends_at").gt("ends_at", new Date().toISOString());
      // Migration not applied yet: nothing is forced.
      if (!error) setForced(Object.fromEntries((data || []).map((row) => [row.pack_name, row.ends_at])));
    };
    void load();
    const channel = supabase.channel("market-stock-overrides")
      .on("postgres_changes", { event: "*", schema: "public", table: "market_stock_overrides" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);
  return forced;
}
