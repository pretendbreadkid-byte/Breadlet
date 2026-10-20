"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleUserRound } from "lucide-react";
import { fetchTradeApi } from "../../lib/supabase/client";

type OnlinePlayer = { id: string; username: string; equippedBlook: string };

const offerSummary = (offer: any) => {
  const blooks = Array.isArray(offer?.blooks) ? offer.blooks : [];
  const tokens = Number(offer?.tokens) || 0;
  return [tokens ? `${tokens.toLocaleString()} tokens` : "", ...blooks.map((item: any) => `${item.name} ×${item.quantity}`)].filter(Boolean).join(" · ") || "Nothing offered";
};

export function TradesPage({ playerId, onlinePlayers, onlineProfileIds, presenceReady, artFor }: {
  playerId: string;
  onlinePlayers: OnlinePlayer[];
  onlineProfileIds: string[];
  presenceReady: boolean;
  artFor: (name: string) => string;
}) {
  const [trades, setTrades] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    const response = await fetchTradeApi({ cache: "no-store" });
    if (response.ok) setTrades(await response.json());
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    const refresh = () => void load();
    window.addEventListener("breadlet:trades-refresh", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("breadlet:trades-refresh", refresh);
    };
  }, [load]);

  const request = async (target: OnlinePlayer) => {
    if (!onlineProfileIds.includes(target.id)) {
      setMessage(presenceReady ? `${target.username} is offline. Both players must be online to trade.` : "Checking player availability. Try again in a moment.");
      return;
    }
    setBusyId(target.id);
    const response = await fetchTradeApi({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", receiverUsername: target.username, offer: { tokens: 0, blooks: [] } }),
    });
    const result = await response.json().catch(() => ({}));
    setBusyId("");
    setMessage(response.ok ? `Trade request sent to ${target.username}.` : result.error || "Could not send the trade request.");
    window.dispatchEvent(new Event("breadlet:trades-refresh"));
    await load();
  };

  const people = onlinePlayers.filter((online) => online.id !== playerId && online.username.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="mx-auto w-full max-w-4xl rounded-3xl border border-white/10 bg-[#0a0a0a] p-5 text-white shadow-2xl">
      <header className="flex flex-col items-center gap-2 border-b border-white/10 pb-5 text-center">
        <img src="/assets/breadlet-logo.svg" alt="Breadlet" className="h-20 w-auto object-contain" />
        <h1 className="text-3xl font-black">Trading</h1>
        <p className="text-sm text-white/60">Pick a player who is online. When they accept, you both enter a live trade room.</p>
      </header>
      {message && <p role="status" className="mt-4 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm font-bold">{message}</p>}
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <section>
          <h2 className="mb-2 text-lg font-black">Players online</h2>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search online players" className="w-full rounded-xl border border-white/10 bg-[#161616] px-3 py-2 text-sm outline-none placeholder:text-white/40" />
          <div className="mt-3 max-h-96 space-y-2 overflow-y-auto">
            {people.map((online) => (
              <div key={online.id} className="flex items-center gap-3 rounded-xl bg-[#161616] px-3 py-2">
                <span className="grid h-10 w-10 shrink-0 place-items-center">{online.equippedBlook ? <img src={artFor(online.equippedBlook)} alt="" className="h-full w-full object-contain" /> : <CircleUserRound size={28} />}</span>
                <span className="min-w-0 flex-1 truncate font-bold">{online.username}</span>
                <button disabled={busyId === online.id} onClick={() => void request(online)} className="rounded-lg bg-white px-3 py-1.5 text-sm font-black text-black hover:bg-white/80 disabled:opacity-50">Trade</button>
              </div>
            ))}
            {!people.length && <p className="py-6 text-center text-sm text-white/50">No other players online right now.</p>}
          </div>
        </section>
        <section>
          <div className="mb-2 flex items-center justify-between"><h2 className="text-lg font-black">Your trades</h2><button onClick={() => void load()} className="rounded-lg border border-white/15 px-3 py-1 text-xs font-bold hover:bg-white/10">Refresh</button></div>
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {trades.map((trade) => {
              const sentByMe = trade.sender_profile_id === playerId;
              const otherName = sentByMe ? trade.receiver_username : trade.sender_username;
              const mine = sentByMe ? trade.sender_offer_json : trade.receiver_offer_json;
              const theirs = sentByMe ? trade.receiver_offer_json : trade.sender_offer_json;
              return (
                <article key={trade.id} className="rounded-xl bg-[#161616] p-3 text-sm">
                  <div className="flex items-center justify-between"><strong>{otherName}</strong><span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold capitalize">{trade.status}</span></div>
                  <p className="mt-1 text-white/70">You: {offerSummary(mine)}</p>
                  <p className="text-white/70">Them: {offerSummary(theirs)}</p>
                </article>
              );
            })}
            {!trades.length && <p className="py-6 text-center text-sm text-white/50">No trades yet.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
